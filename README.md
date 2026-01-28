# GH Secrets CLI

A local CLI tool to easily manage GitHub Actions secrets without using the web interface.

## Features

- ✅ **Two Authentication Methods:**
  - Personal Access Token (PAT) - Simple and quick
  - OAuth Device Flow - Browser-based with custom scopes
- ✅ Manage secrets for personal repositories
- ✅ Manage secrets for organization repositories
- ✅ List all secrets in a repository
- ✅ Add/Update individual secrets
- ✅ Batch upload secrets from `.env` files
- ✅ Delete secrets
- ✅ No database - completely local
- ✅ Secure password masking for sensitive input

## Prerequisites

- Node.js 18+ installed
- **Choose one authentication method:**

### Option 1: Personal Access Token (Easier)

Create a Personal Access Token with required scopes:

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `admin:org` (Full control of orgs and teams) - if managing org repos
4. Copy the generated token

### Option 2: OAuth Device Flow (Better UX)

**✨ If you're publishing this CLI tool**, you can set up your own OAuth App and hardcode the Client ID - it's **safe to be public**!

**Why Client IDs are safe to publish:**

- ✅ OAuth Client IDs are designed to be public (unlike Client Secrets)
- ✅ Device Flow doesn't use secrets - security comes from user authorization
- ✅ Users explicitly approve in their browser with GitHub's authentication
- ✅ Real examples: GitHub CLI, Heroku CLI, and many others ship with hardcoded Client IDs

**Setup for publishing:**

1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: GitHub Secret Manager (or your chosen name)
   - **Homepage URL**: `http://localhost` (or your project URL)
   - **Authorization callback URL**: `http://localhost`
4. After creating, click **"Enable Device Flow"** (important!)
5. Copy the **Client ID**
6. In `cli.ts`, replace `DEFAULT_OAUTH_CLIENT_ID` with your Client ID:
   ```typescript
   const DEFAULT_OAUTH_CLIENT_ID = "Ov23liYourActualClientID";
   ```
7. Publish! Users won't need to create their own OAuth App

**For end users** (if a default OAuth App is configured):

- Just run the app and choose "OAuth Device Flow"
- No need to create your own OAuth App
- Optional: Use your own OAuth App if desired

## Installation

### For End Users

**Option 1: Using npx (No installation needed)**

```bash
npx gh-secrets-cli
```

**Option 2: Global Installation**

```bash
npm install -g gh-secrets-cli
```

Then run anywhere:

```bash
gh-secret-cli
```

### For Development

```bash
# Clone the repository
git clone https://github.com/jbacule/gh-secrets-cli.git
cd gh-secrets-cli

# Install dependencies
pnpm install

# Run in development mode
pnpm start

# Build for production
pnpm build
```

## Usage

```bash
# Start the CLI
pnpm start
```

### Authentication Flow

When you start the app, you'll choose between:

**1. Personal Access Token**

- Paste your PAT directly
- Quick and simple
- Good for personal use

**2. OAuth Device Flow**

- Enter your OAuth App Client ID
- Browser opens automatically to GitHub
- Enter the displayed code
- Approve the requested permissions
- Handles 2FA automatically (through GitHub's web interface)
- Can customize scopes per session

### Workflow

1. **Login**: Choose authentication method and authenticate
2. **Choose scope**: Select Personal or Organization repositories
3. **Select repository**: Choose which repository to manage
4. **Manage secrets**:
   - List all existing secrets
   - Add/Update a single secret manually
   - Upload multiple secrets from a `.env` file
   - Delete secrets

### Example .env File

Create a `.env` file with your secrets:

```env
# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/db
DATABASE_PASSWORD=supersecret123

# API Keys
API_KEY=your_api_key_here
STRIPE_SECRET_KEY=sk_test_123456789

# AWS Credentials
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

Then use the "Upload Secrets from .env File" option to batch upload all secrets to your repository.

## Authentication Comparison

| Feature             | Personal Access Token | OAuth Device Flow                |
| ------------------- | --------------------- | -------------------------------- |
| Setup Complexity    | Simple                | Requires OAuth App               |
| 2FA Support         | Token creation only   | Handled by GitHub                |
| Scope Customization | During token creation | Per authentication session       |
| Token Visibility    | You see the token     | Token hidden (managed by GitHub) |
| Revocation          | Manual in settings    | Automatic on app revoke          |
| Best For            | Personal use, scripts | Team use, better UX              |

## Security Notes

- Never commit your `.env` files to version control
- Keep your GitHub token secure
- This tool runs locally and doesn't store any data
- All secrets are encrypted using libsodium before sending to GitHub
- OAuth tokens are used immediately and not stored

## Troubleshooting

### OAuth Device Flow Issues

1. **"device_flow_disabled" error**: Make sure you enabled Device Flow in your OAuth App settings
2. **Browser doesn't open**: Manually visit the URL shown in the terminal
3. **Token expired**: The device code expires after 15 minutes. Just restart the authentication.

### Permission Issues

- For organization secrets, ensure your OAuth scopes include `admin:org`
- For private repositories, ensure `repo` scope is included

## Limitations

- Secret names must only contain alphanumeric characters or underscores
- Secret names cannot start with `GITHUB_`
- Secret names cannot start with a number

## License

[MIT LICENSE](./LICENSE)
