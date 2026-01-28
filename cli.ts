import { select, input, confirm, password } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { GitHubService, Repository, Secret } from "./github.js";
import { readEnvFile, filterValidSecrets } from "./env-parser.js";
import { GitHubOAuthDevice } from "./oauth.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Default OAuth App Client ID (safe to be public)
// Users can override this with their own OAuth App if desired
const DEFAULT_OAUTH_CLIENT_ID = "Ov23li3xgnuTj9rfcWSt"; // Replace with your actual Client ID

export class SecretManagerCLI {
  private github: GitHubService | null = null;
  private currentUser: any = null;

  async start() {
    console.clear();
    console.log(chalk.bold.blue("\n🔐 gh-secrets-cli\n"));

    await this.authenticate();
    await this.mainMenu();
  }

  private async authenticate() {
    const authMethod = await select({
      message: "How would you like to authenticate?",
      choices: [
        {
          name: "Personal Access Token",
          value: "token",
          description:
            "Use a GitHub Personal Access Token (classic or fine-grained)",
        },
        {
          name: "OAuth Device Flow (Browser)",
          value: "oauth",
          description:
            "Authenticate via browser with custom scopes (requires OAuth App setup)",
        },
      ],
    });

    if (authMethod === "token") {
      await this.authenticateWithToken();
    } else {
      await this.authenticateWithOAuth();
    }
  }

  private async authenticateWithToken() {
    console.log(
      chalk.dim(
        "\n💡 Tip: Create a token at https://github.com/settings/tokens\n",
      ),
    );
    console.log(chalk.yellow("Required scopes:"));
    console.log(
      chalk.yellow("  • repo (Full control of private repositories)"),
    );
    console.log(
      chalk.yellow("  • admin:org (if managing organization secrets)\n"),
    );

    const token = await password({
      message: "Enter your GitHub Personal Access Token:",
      mask: "*",
    });

    const spinner = ora("Authenticating...").start();

    try {
      this.github = new GitHubService(token);
      this.currentUser = await this.github.getAuthenticatedUser();
      spinner.succeed(
        chalk.green(`✓ Authenticated as ${chalk.bold(this.currentUser.login)}`),
      );
    } catch (error) {
      spinner.fail(chalk.red("Authentication failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );

      const retry = await confirm({
        message: "Would you like to try again?",
        default: true,
      });

      if (retry) {
        await this.authenticate();
      } else {
        process.exit(1);
      }
    }
  }

  private async authenticateWithOAuth() {
    console.log(chalk.cyan("\n📱 OAuth Device Flow Authentication\n"));

    let clientId = DEFAULT_OAUTH_CLIENT_ID;

    // Only show setup instructions if no default client ID is configured
    if (!DEFAULT_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID.includes("XXX")) {
      console.log(chalk.yellow("⚠️  No default OAuth App configured.\n"));
      console.log(chalk.dim("You can either:"));
      console.log(chalk.dim("1. Use your own OAuth App"));
      console.log(chalk.dim("2. Use Personal Access Token instead\n"));

      const useOwnApp = await confirm({
        message: "Do you have your own OAuth App?",
        default: false,
      });

      if (!useOwnApp) {
        const useToken = await confirm({
          message: "Would you like to use a Personal Access Token instead?",
          default: true,
        });

        if (useToken) {
          await this.authenticateWithToken();
        } else {
          console.log(chalk.blue("\n📝 OAuth App Setup Instructions:"));
          console.log(
            chalk.blue("1. Go to https://github.com/settings/developers"),
          );
          console.log(chalk.blue("2. Click 'New OAuth App'"));
          console.log(chalk.blue("3. Fill in the details:"));
          console.log(chalk.blue("   - Application name: gh-secrets-cli"));
          console.log(chalk.blue("   - Homepage URL: http://localhost"));
          console.log(
            chalk.blue("   - Authorization callback URL: http://localhost"),
          );
          console.log(
            chalk.blue("4. After creating, click 'Enable Device Flow'"),
          );
          console.log(chalk.blue("5. Copy the Client ID and restart\n"));
          process.exit(0);
        }
        return;
      }

      clientId = await input({
        message: "Enter your OAuth App Client ID:",
        validate: (value) => {
          if (!value) return "Client ID is required";
          return true;
        },
      });
    } else {
      console.log(chalk.dim(`Using default OAuth App\n`));

      const useCustomApp = await confirm({
        message: "Use your own OAuth App instead?",
        default: false,
      });

      if (useCustomApp) {
        clientId = await input({
          message: "Enter your OAuth App Client ID:",
          validate: (value) => {
            if (!value) return "Client ID is required";
            return true;
          },
        });
      }
    }

    // Ask for scopes
    const includeOrgScopes = await confirm({
      message: "Will you manage organization repositories?",
      default: true,
    });

    const scopes = includeOrgScopes
      ? ["repo", "admin:org", "write:org"]
      : ["repo"];

    console.log(chalk.dim(`\nRequesting scopes: ${scopes.join(", ")}\n`));

    const spinner = ora("Initializing OAuth flow...").start();

    try {
      const oauth = new GitHubOAuthDevice({
        clientId,
        scopes,
      });

      // Request device code
      const deviceCode = await oauth.requestDeviceCode();
      spinner.stop();

      console.log(chalk.bold.green("\n✓ Device code generated!\n"));
      console.log(chalk.cyan("Please follow these steps to authorize:\n"));
      console.log(
        chalk.bold(`1. Visit: ${chalk.underline(deviceCode.verification_uri)}`),
      );
      console.log(
        chalk.bold(
          `2. Enter code: ${chalk.yellow.bold(deviceCode.user_code)}\n`,
        ),
      );

      // Try to open browser automatically
      try {
        await execAsync(`open ${deviceCode.verification_uri}`);
        console.log(chalk.dim("✓ Browser opened automatically\n"));
      } catch {
        // Ignore if can't open browser
      }

      spinner.start("Waiting for authorization in browser...");

      // Poll for token using the device code we already requested
      const tokenData = await oauth.pollForAccessToken(
        deviceCode.device_code,
        deviceCode.interval,
      );
      spinner.stop();

      // Authenticate with the token
      this.github = new GitHubService(tokenData.access_token);
      this.currentUser = await this.github.getAuthenticatedUser();

      console.log(
        chalk.bold.green(
          `\n✓ Successfully authenticated as ${chalk.bold(this.currentUser.login)}!\n`,
        ),
      );
    } catch (error) {
      spinner.fail(chalk.red("OAuth authentication failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );

      const retry = await confirm({
        message: "Would you like to try again?",
        default: true,
      });

      if (retry) {
        await this.authenticate();
      } else {
        process.exit(1);
      }
    }
  }

  private async mainMenu() {
    while (true) {
      const action = await select({
        message: "What would you like to do?",
        choices: [
          {
            name: "Manage Personal Repositories",
            value: "personal",
            description: "Manage secrets for your personal repositories",
          },
          {
            name: "Manage Organization Repositories",
            value: "organization",
            description: "Manage secrets for organization repositories",
          },
          {
            name: "Exit",
            value: "exit",
          },
        ],
      });

      if (action === "exit") {
        console.log(chalk.blue("\n👋 Goodbye!\n"));
        process.exit(0);
      }

      if (action === "personal") {
        await this.managePersonalRepos();
      } else if (action === "organization") {
        await this.manageOrganizationRepos();
      }
    }
  }

  private async managePersonalRepos() {
    const spinner = ora("Loading repositories...").start();

    try {
      const repos = await this.github!.listUserRepositories();
      spinner.stop();

      if (repos.length === 0) {
        console.log(chalk.yellow("No repositories found."));
        return;
      }

      const repo = await this.selectRepository(repos);
      if (repo) {
        await this.manageRepoSecrets(repo.owner.login, repo.name);
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load repositories"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async manageOrganizationRepos() {
    const spinner = ora("Loading organizations...").start();

    try {
      const orgs = await this.github!.listOrganizations();
      spinner.stop();

      if (orgs.length === 0) {
        console.log(chalk.yellow("No organizations found."));
        return;
      }

      const org = await select({
        message: "Select an organization:",
        choices: orgs.map((o) => ({
          name: `${o.login}${o.description ? ` - ${o.description}` : ""}`,
          value: o.login,
        })),
      });

      spinner.start("Loading repositories...");
      const repos = await this.github!.listOrgRepositories(org);
      spinner.stop();

      if (repos.length === 0) {
        console.log(
          chalk.yellow("No repositories found in this organization."),
        );
        return;
      }

      const repo = await this.selectRepository(repos);
      if (repo) {
        await this.manageRepoSecrets(org, repo.name);
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load organizations"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async selectRepository(
    repos: Repository[],
  ): Promise<Repository | null> {
    const repoName = await select({
      message: "Select a repository:",
      choices: [
        ...repos.map((r) => ({
          name: `${r.name} ${r.private ? chalk.yellow("(private)") : chalk.green("(public)")}`,
          value: r.full_name,
          description: r.full_name,
        })),
        {
          name: chalk.gray("← Back"),
          value: "back",
        },
      ],
      pageSize: 15,
    });

    if (repoName === "back") {
      return null;
    }

    return repos.find((r) => r.full_name === repoName) || null;
  }

  private async manageRepoSecrets(owner: string, repo: string) {
    while (true) {
      console.log(chalk.bold.cyan(`\n📦 Repository: ${owner}/${repo}\n`));

      const action = await select({
        message: "Choose an action:",
        choices: [
          {
            name: "List Secrets",
            value: "list",
            description: "View all secrets in this repository",
          },
          {
            name: "Add/Update Single Secret",
            value: "add",
            description: "Create or update a single secret",
          },
          {
            name: "Upload Secrets from .env File",
            value: "upload",
            description: "Batch upload secrets from a .env file",
          },
          {
            name: "Delete Secret",
            value: "delete",
            description: "Remove a secret from the repository",
          },
          {
            name: chalk.gray("← Back to Repository Selection"),
            value: "back",
          },
        ],
      });

      if (action === "back") {
        break;
      }

      switch (action) {
        case "list":
          await this.listSecrets(owner, repo);
          break;
        case "add":
          await this.addSingleSecret(owner, repo);
          break;
        case "upload":
          await this.uploadSecretsFromFile(owner, repo);
          break;
        case "delete":
          await this.deleteSecret(owner, repo);
          break;
      }
    }
  }

  private async listSecrets(owner: string, repo: string) {
    const spinner = ora("Loading secrets...").start();

    try {
      const secrets = await this.github!.listRepoSecrets(owner, repo);
      spinner.stop();

      if (secrets.length === 0) {
        console.log(chalk.yellow("\nNo secrets found in this repository."));
      } else {
        console.log(chalk.bold.green(`\nFound ${secrets.length} secret(s):\n`));
        secrets.forEach((secret: Secret) => {
          console.log(
            `  ${chalk.cyan("•")} ${chalk.bold(secret.name)} ${chalk.gray(`(updated: ${new Date(secret.updated_at).toLocaleDateString()})`)}`,
          );
        });
      }
      console.log();
    } catch (error) {
      spinner.fail(chalk.red("Failed to load secrets"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async addSingleSecret(owner: string, repo: string) {
    try {
      const name = await input({
        message: "Secret name:",
        validate: (value) => {
          if (!value) return "Secret name is required";
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
            return "Invalid name. Use only letters, numbers, and underscores. Cannot start with a number.";
          }
          if (value.startsWith("GITHUB_")) {
            return "Secret names cannot start with GITHUB_";
          }
          return true;
        },
      });

      const value = await password({
        message: "Secret value:",
        mask: "*",
      });

      const spinner = ora(`Creating/updating secret ${name}...`).start();

      await this.github!.createOrUpdateRepoSecret(owner, repo, name, value);
      spinner.succeed(
        chalk.green(`✓ Secret "${name}" created/updated successfully`),
      );
    } catch (error) {
      console.error(
        chalk.red(
          `✗ Failed to create secret: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private async uploadSecretsFromFile(owner: string, repo: string) {
    try {
      const filePath = await input({
        message: "Path to .env file:",
        default: ".env",
      });

      const spinner = ora("Reading .env file...").start();

      let secrets: Record<string, string>;
      try {
        secrets = readEnvFile(filePath);
        spinner.succeed(
          `Found ${Object.keys(secrets).length} variables in ${filePath}`,
        );
      } catch (error) {
        spinner.fail(chalk.red("Failed to read file"));
        console.error(
          chalk.red(error instanceof Error ? error.message : String(error)),
        );
        return;
      }

      if (Object.keys(secrets).length === 0) {
        console.log(chalk.yellow("No secrets found in the file."));
        return;
      }

      const { valid, invalid } = filterValidSecrets(secrets);

      if (invalid.length > 0) {
        console.log(
          chalk.yellow(`\n⚠ Invalid secret names (will be skipped):`),
        );
        invalid.forEach((name) => console.log(chalk.yellow(`  • ${name}`)));
      }

      if (Object.keys(valid).length === 0) {
        console.log(chalk.red("\nNo valid secrets to upload."));
        return;
      }

      console.log(
        chalk.cyan(`\n✓ Valid secrets to upload: ${Object.keys(valid).length}`),
      );
      Object.keys(valid).forEach((name) =>
        console.log(chalk.cyan(`  • ${name}`)),
      );

      const confirmUpload = await confirm({
        message: `Upload ${Object.keys(valid).length} secret(s) to ${owner}/${repo}?`,
        default: true,
      });

      if (!confirmUpload) {
        console.log(chalk.gray("Upload cancelled."));
        return;
      }

      spinner.start("Uploading secrets...");
      const result = await this.github!.batchCreateSecrets(owner, repo, valid);
      spinner.stop();

      if (result.success.length > 0) {
        console.log(
          chalk.green(
            `\n✓ Successfully uploaded ${result.success.length} secret(s):`,
          ),
        );
        result.success.forEach((name) =>
          console.log(chalk.green(`  • ${name}`)),
        );
      }

      if (result.failed.length > 0) {
        console.log(
          chalk.red(`\n✗ Failed to upload ${result.failed.length} secret(s):`),
        );
        result.failed.forEach(({ name, error }) =>
          console.log(chalk.red(`  • ${name}: ${error}`)),
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private async deleteSecret(owner: string, repo: string) {
    const spinner = ora("Loading secrets...").start();

    try {
      const secrets = await this.github!.listRepoSecrets(owner, repo);
      spinner.stop();

      if (secrets.length === 0) {
        console.log(chalk.yellow("No secrets found in this repository."));
        return;
      }

      const secretName = await select({
        message: "Select a secret to delete:",
        choices: [
          ...secrets.map((s: Secret) => ({
            name: s.name,
            value: s.name,
          })),
          {
            name: chalk.gray("← Cancel"),
            value: "cancel",
          },
        ],
      });

      if (secretName === "cancel") {
        return;
      }

      const confirmDelete = await confirm({
        message: chalk.red(`Are you sure you want to delete "${secretName}"?`),
        default: false,
      });

      if (confirmDelete) {
        spinner.start(`Deleting secret ${secretName}...`);
        await this.github!.deleteRepoSecret(owner, repo, secretName);
        spinner.succeed(
          chalk.green(`✓ Secret "${secretName}" deleted successfully`),
        );
      } else {
        console.log(chalk.gray("Deletion cancelled."));
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to delete secret"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
