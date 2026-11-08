/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Refresh-token grant only. There is no browser flow: obtain the refresh token
 * once with Microsoft's consent flow, then pass it in BING_ADS_REFRESH_TOKEN.
 */
import type { BingConfig } from "./config.js";
import { TOKEN_HOSTS, assertAllowedRequestUrl } from "./hosts.js";
import { REQUEST_TIMEOUT_MS, readBounded } from "./http.js";

/** Microsoft Advertising API scope. It identifies the API; nothing is fetched from it. */
export const MICROSOFT_ADS_SCOPE = "https://ads.microsoft.com/msads.manage offline_access";

export type BingTokens = { accessToken: string; refreshToken: string; expiresIn: number };
type OAuthConfig = Pick<BingConfig, "identityProvider" | "clientId" | "clientSecret" | "tenant">;

export function tokenEndpoint(config: Pick<BingConfig, "identityProvider" | "tenant">): string {
  if (config.identityProvider === "Google") return TOKEN_HOSTS.Google;
  if (!/^[A-Za-z0-9.-]{1,100}$/.test(config.tenant)) throw new Error("Invalid BING_ADS_OAUTH_TENANT.");
  return `${TOKEN_HOSTS.Microsoft}/${config.tenant}/oauth2/v2.0/token`;
}

/**
 * Exchanges the refresh token for an access token. Microsoft may rotate the
 * refresh token; Google usually omits it. The caller keeps the result in memory
 * only. Provider error bodies are never echoed, since they can quote secrets.
 */
export async function refreshAccessToken(config: OAuthConfig, refreshToken: string): Promise<BingTokens> {
  if (!refreshToken) throw new Error("BING_ADS_REFRESH_TOKEN is missing.");
  const url = tokenEndpoint(config);
  assertAllowedRequestUrl(url);
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    ...(config.identityProvider === "Microsoft" ? { scope: MICROSOFT_ADS_SCOPE } : {}),
  });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
  } catch {
    throw new Error("The OAuth token request did not complete. Check the network and retry.");
  }
  let value: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await readBounded(response, 100_000, "OAuth token response")));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { value = null; }
  const error = typeof value?.error === "string" && /^[a-z_]{1,64}$/.test(value.error) ? ` (${value.error})` : "";
  if (!response.ok || !value || typeof value.access_token !== "string" || !value.access_token ||
      typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
    throw new Error(`Microsoft Advertising OAuth refresh failed (HTTP ${response.status}${error}). ` +
      "If the refresh token expired or was revoked, obtain a new one and restart the server.");
  }
  const rotated = typeof value.refresh_token === "string" && value.refresh_token ? value.refresh_token : refreshToken;
  return { accessToken: value.access_token, refreshToken: rotated, expiresIn: value.expires_in };
}
