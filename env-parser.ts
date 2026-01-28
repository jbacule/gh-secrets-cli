import { readFileSync } from "fs";

/**
 * Parse .env file content into key-value pairs
 */
export function parseEnvFile(content: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE format
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;

      // Remove quotes if present
      let cleanValue = value.trim();
      if (
        (cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
        (cleanValue.startsWith("'") && cleanValue.endsWith("'"))
      ) {
        cleanValue = cleanValue.slice(1, -1);
      }

      secrets[key] = cleanValue;
    }
  }

  return secrets;
}

/**
 * Read and parse an .env file from disk
 */
export function readEnvFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf-8");
  return parseEnvFile(content);
}

/**
 * Validate secret names according to GitHub's requirements
 */
export function validateSecretName(name: string): boolean {
  // GitHub secret names must:
  // - Only contain alphanumeric characters ([a-z], [A-Z], [0-9]) or underscores (_)
  // - Must not start with GITHUB_
  // - Must not start with a number
  const pattern = /^(?!GITHUB_)[A-Za-z_][A-Za-z0-9_]*$/;
  return pattern.test(name);
}

/**
 * Filter out invalid secret names
 */
export function filterValidSecrets(secrets: Record<string, string>): {
  valid: Record<string, string>;
  invalid: string[];
} {
  const valid: Record<string, string> = {};
  const invalid: string[] = [];

  for (const [name, value] of Object.entries(secrets)) {
    if (validateSecretName(name)) {
      valid[name] = value;
    } else {
      invalid.push(name);
    }
  }

  return { valid, invalid };
}
