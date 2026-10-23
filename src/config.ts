/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";

export type BingEnvironment = "production" | "sandbox";
export type BingIdentity = "Microsoft" | "Google";

/** Microsoft's universal sandbox developer token. It never works in production. */
export const SANDBOX_DEVELOPER_TOKEN = "BBD37VB98";
export const MAX_ACCOUNTS = 200;

/** Microsoft Advertising IDs are positive signed 64-bit integers, kept as strings. */
export function isBingId(value: string): boolean {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}

const id = z.string().refine(isBingId);
const schema = z.object({
  environment: z.enum(["production", "sandbox"]),
  identityProvider: z.enum(["Microsoft", "Google"]).default("Microsoft"),
  developerToken: z.string().min(1).max(200).optional(),
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().min(1).max(1000).optional(),
  refreshToken: z.string().min(1).max(20000),
  tenant: z.string().regex(/^[A-Za-z0-9.-]{1,100}$/).default("common"),
  allowedAccounts: z.record(id, id),
  enableWrites: z.boolean().default(false),
});

export type BingConfig = z.output<typeof schema>;
export type BingConfigInput = z.input<typeof schema>;

/** Validates a configuration object. Error messages never include a supplied value. */
export function validateConfig(value: unknown): BingConfig {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => ENV_NAMES[String(issue.path[0])] ?? "configuration"))];
    throw new Error(`Missing or invalid ${fields.join(", ")}. ${HELP}`);
  }
  const config = result.data;
  const accounts = Object.keys(config.allowedAccounts);
  if (!accounts.length || accounts.length > MAX_ACCOUNTS) {
    throw new Error(`Set BING_ADS_ACCOUNT_IDS to between 1 and ${MAX_ACCOUNTS} account IDs. ${HELP}`);
  }
  if (config.environment === "production" && (!config.developerToken || config.developerToken === SANDBOX_DEVELOPER_TOKEN)) {
    throw new Error("Production requires your own Microsoft Advertising developer token in BING_ADS_DEVELOPER_TOKEN. Use BING_ADS_ENVIRONMENT=sandbox to try the sandbox.");
  }
  if (config.identityProvider === "Google" && !config.clientSecret) {
    throw new Error("BING_ADS_IDENTITY_PROVIDER=Google requires BING_ADS_CLIENT_SECRET from your Google OAuth client.");
  }
  return { ...config, allowedAccounts: Object.freeze({ ...config.allowedAccounts }) };
}

const ENV_NAMES: Record<string, string> = {
  environment: "BING_ADS_ENVIRONMENT", identityProvider: "BING_ADS_IDENTITY_PROVIDER", developerToken: "BING_ADS_DEVELOPER_TOKEN",
  clientId: "BING_ADS_CLIENT_ID", clientSecret: "BING_ADS_CLIENT_SECRET", refreshToken: "BING_ADS_REFRESH_TOKEN",
  tenant: "BING_ADS_OAUTH_TENANT", allowedAccounts: "BING_ADS_ACCOUNT_IDS", enableWrites: "BING_ADS_ENABLE_WRITES",
};
const HELP = "Required: BING_ADS_CLIENT_ID, BING_ADS_REFRESH_TOKEN, BING_ADS_ACCOUNT_IDS and BING_ADS_CUSTOMER_ID (or accountId:customerId entries), plus BING_ADS_DEVELOPER_TOKEN in production. See .env.example.";

/** "123,456:789" maps each account to its owning customer, defaulting to BING_ADS_CUSTOMER_ID. */
export function parseAccounts(raw: string, defaultCustomer: string | undefined): Record<string, string> {
  const accounts: Record<string, string> = {};
  for (const entry of raw.split(",").map(v => v.trim()).filter(Boolean)) {
    const [account, customer = defaultCustomer, extra] = entry.split(":").map(v => v.trim());
    if (extra !== undefined || !account || !isBingId(account)) {
      throw new Error("BING_ADS_ACCOUNT_IDS entries must be numeric account IDs, optionally written accountId:customerId. Use the account ID, not the eight-character account number shown in the web app.");
    }
    if (!customer || !isBingId(customer)) {
      throw new Error("Set BING_ADS_CUSTOMER_ID to the numeric customer ID that owns the accounts, or write each entry as accountId:customerId.");
    }
    if (accounts[account] && accounts[account] !== customer) throw new Error("An account appears twice in BING_ADS_ACCOUNT_IDS with different customer IDs.");
    accounts[account] = customer;
  }
  return accounts;
}

/** Reads the BING_ADS_* environment variables. Only the exact value true enables writes. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BingConfig {
  const read = (name: string) => (env[name] ?? "").trim() || undefined;
  const choice = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const value = read(name) ?? fallback;
    if (!allowed.includes(value as T)) throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
    return value as T;
  };
  const writes = env.BING_ADS_ENABLE_WRITES ?? "false";
  if (writes !== "true" && writes !== "false") throw new Error("BING_ADS_ENABLE_WRITES must be exactly true or false.");
  return validateConfig({
    environment: choice("BING_ADS_ENVIRONMENT", ["production", "sandbox"] as const, "production"),
    identityProvider: choice("BING_ADS_IDENTITY_PROVIDER", ["Microsoft", "Google"] as const, "Microsoft"),
    developerToken: read("BING_ADS_DEVELOPER_TOKEN"),
    clientId: read("BING_ADS_CLIENT_ID") ?? "",
    clientSecret: read("BING_ADS_CLIENT_SECRET"),
    refreshToken: read("BING_ADS_REFRESH_TOKEN") ?? "",
    tenant: read("BING_ADS_OAUTH_TENANT") ?? "common",
    allowedAccounts: parseAccounts(read("BING_ADS_ACCOUNT_IDS") ?? "", read("BING_ADS_CUSTOMER_ID")),
    enableWrites: writes === "true",
  });
}
