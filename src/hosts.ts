/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every host this server may contact, in one place. A test fails when another
 * https:// host appears in src/, so adding one is a deliberate decision.
 */
import type { BingEnvironment } from "./config.js";

/** Microsoft Advertising REST API v13 hosts, per environment. */
export const API_HOSTS = {
  production: {
    campaign: "https://campaign.api.bingads.microsoft.com",
    customer: "https://clientcenter.api.bingads.microsoft.com",
    reporting: "https://reporting.api.bingads.microsoft.com",
  },
  sandbox: {
    campaign: "https://campaign.api.sandbox.bingads.microsoft.com",
    customer: "https://clientcenter.api.sandbox.bingads.microsoft.com",
    reporting: "https://reporting.api.sandbox.bingads.microsoft.com",
  },
} as const satisfies Record<BingEnvironment, Record<string, string>>;

/** OAuth token endpoints. No authorization (browser) endpoint is used. */
export const TOKEN_HOSTS = {
  Microsoft: "https://login.microsoftonline.com",
  Google: "https://oauth2.googleapis.com/token",
} as const;

/**
 * Report files are downloaded from a URL that Microsoft returns. That URL is
 * data: it must use one of these host suffixes, and it is fetched without any
 * credential and without following redirects.
 */
export const REPORT_DOWNLOAD_HOST_SUFFIXES = [".bingads.microsoft.com", ".blob.core.windows.net"] as const;

export function apiBase(environment: BingEnvironment, service: "campaign" | "customer" | "reporting"): string {
  if (environment !== "production" && environment !== "sandbox") throw new Error("Invalid Microsoft Advertising environment.");
  return API_HOSTS[environment][service];
}

/** Refuses any request URL whose origin is not one of the API or token hosts above. */
export function assertAllowedRequestUrl(url: string): void {
  const target = new URL(url);
  const origins = new Set<string>([
    ...Object.values(API_HOSTS.production),
    ...Object.values(API_HOSTS.sandbox),
    TOKEN_HOSTS.Microsoft,
    new URL(TOKEN_HOSTS.Google).origin,
  ]);
  if (target.protocol !== "https:" || target.username || target.password || target.port || !origins.has(target.origin)) {
    throw new Error("Refused a request to a host outside the Microsoft Advertising allowlist.");
  }
}
