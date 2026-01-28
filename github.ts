import { Octokit } from "octokit";
import sodium from "libsodium-wrappers";

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    type: string;
  };
}

export interface Organization {
  login: string;
  id: number;
  description: string | null;
}

export interface Secret {
  name: string;
  created_at: string;
  updated_at: string;
}

export interface PublicKey {
  key_id: string;
  key: string;
}

export class GitHubService {
  private octokit: Octokit;
  private apiVersion = "2022-11-28";

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * Get the authenticated user's information
   */
  async getAuthenticatedUser() {
    const { data } = await this.octokit.request("GET /user", {
      headers: {
        "X-GitHub-Api-Version": this.apiVersion,
      },
    });
    return data;
  }

  /**
   * List all organizations the user belongs to
   */
  async listOrganizations(): Promise<Organization[]> {
    const { data } = await this.octokit.request("GET /user/orgs", {
      headers: {
        "X-GitHub-Api-Version": this.apiVersion,
      },
      per_page: 100,
    });
    return data;
  }

  /**
   * List repositories for the authenticated user
   */
  async listUserRepositories(): Promise<Repository[]> {
    const { data } = await this.octokit.request("GET /user/repos", {
      headers: {
        "X-GitHub-Api-Version": this.apiVersion,
      },
      per_page: 100,
      sort: "updated",
    });
    return data;
  }

  /**
   * List repositories for an organization
   */
  async listOrgRepositories(org: string): Promise<Repository[]> {
    const { data } = await this.octokit.request("GET /orgs/{org}/repos", {
      org,
      headers: {
        "X-GitHub-Api-Version": this.apiVersion,
      },
      per_page: 100,
      sort: "updated",
    });
    return data;
  }

  /**
   * List all secrets in a repository
   */
  async listRepoSecrets(owner: string, repo: string): Promise<Secret[]> {
    const { data } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/actions/secrets",
      {
        owner,
        repo,
        headers: {
          "X-GitHub-Api-Version": this.apiVersion,
        },
      },
    );
    return data.secrets || [];
  }

  /**
   * Get repository's public key for encrypting secrets
   */
  private async getRepoPublicKey(
    owner: string,
    repo: string,
  ): Promise<PublicKey> {
    const { data } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/actions/secrets/public-key",
      {
        owner,
        repo,
        headers: {
          "X-GitHub-Api-Version": this.apiVersion,
        },
      },
    );
    return data;
  }

  /**
   * Encrypt a secret value using the repository's public key
   */
  private async encryptSecret(
    secretValue: string,
    publicKey: string,
  ): Promise<string> {
    await sodium.ready;

    const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(secretValue);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    
    return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
  }

  /**
   * Create or update a repository secret
   */
  async createOrUpdateRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
    secretValue: string,
  ): Promise<void> {
    const publicKeyData = await this.getRepoPublicKey(owner, repo);
    const encryptedValue = await this.encryptSecret(
      secretValue,
      publicKeyData.key,
    );

    await this.octokit.request(
      "PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}",
      {
        owner,
        repo,
        secret_name: secretName,
        encrypted_value: encryptedValue,
        key_id: publicKeyData.key_id,
        headers: {
          "X-GitHub-Api-Version": this.apiVersion,
        },
      },
    );
  }

  /**
   * Delete a repository secret
   */
  async deleteRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
  ): Promise<void> {
    await this.octokit.request(
      "DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}",
      {
        owner,
        repo,
        secret_name: secretName,
        headers: {
          "X-GitHub-Api-Version": this.apiVersion,
        },
      },
    );
  }

  /**
   * Batch create/update multiple secrets
   */
  async batchCreateSecrets(
    owner: string,
    repo: string,
    secrets: Record<string, string>,
  ): Promise<{ success: string[]; failed: { name: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const [name, value] of Object.entries(secrets)) {
      try {
        await this.createOrUpdateRepoSecret(owner, repo, name, value);
        success.push(name);
      } catch (error) {
        failed.push({
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { success, failed };
  }
}
