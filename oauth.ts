import axios from "axios";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface OAuthConfig {
  clientId: string;
  scopes: string[];
}

export class GitHubOAuthDevice {
  private clientId: string;
  private scopes: string[];

  constructor(config: OAuthConfig) {
    this.clientId = config.clientId;
    this.scopes = config.scopes;
  }

  /**
   * Step 1: Request device and user verification codes
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const response = await axios.post(
      "https://github.com/login/device/code",
      {
        client_id: this.clientId,
        scope: this.scopes.join(" "),
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  }

  /**
   * Step 2: Poll for access token
   */
  async pollForAccessToken(
    deviceCode: string,
    interval: number,
  ): Promise<AccessTokenResponse> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
              client_id: this.clientId,
              device_code: deviceCode,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            },
            {
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            },
          );

          const data = response.data;

          // Check for errors
          if (data.error) {
            if (data.error === "authorization_pending") {
              // Continue polling
              setTimeout(poll, interval * 1000);
              return;
            } else if (data.error === "slow_down") {
              // Increase interval by 5 seconds
              setTimeout(poll, (interval + 5) * 1000);
              return;
            } else if (data.error === "expired_token") {
              reject(new Error("Device code expired. Please try again."));
              return;
            } else if (data.error === "access_denied") {
              reject(new Error("Access denied by user."));
              return;
            } else {
              reject(new Error(`OAuth error: ${data.error}`));
              return;
            }
          }

          // Success!
          if (data.access_token) {
            resolve(data);
            return;
          }

          // Unexpected response, continue polling
          setTimeout(poll, interval * 1000);
        } catch (error) {
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Complete device flow authentication (convenience method)
   * Use this if you want a single method to handle the entire flow.
   *
   * For more control (e.g., showing the verification URL/code to users),
   * call requestDeviceCode() and pollForAccessToken() separately.
   */
  async authenticate(): Promise<string> {
    // Step 1: Get device code
    const deviceCodeData = await this.requestDeviceCode();

    // Step 2: Poll for token
    const tokenData = await this.pollForAccessToken(
      deviceCodeData.device_code,
      deviceCodeData.interval,
    );

    return tokenData.access_token;
  }
}
