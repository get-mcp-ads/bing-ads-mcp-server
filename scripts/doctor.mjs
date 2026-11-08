#!/usr/bin/env node
/**
 * Reports which BING_ADS_* variables are set and whether this Node.js release
 * carries the October 2026 security fixes. Values are never printed.
 */
import { loadConfig, nodeRuntimeWarning } from "../dist/index.js";

const required = ["BING_ADS_CLIENT_ID", "BING_ADS_REFRESH_TOKEN", "BING_ADS_ACCOUNT_IDS"];
const optional = ["BING_ADS_DEVELOPER_TOKEN", "BING_ADS_CUSTOMER_ID", "BING_ADS_CLIENT_SECRET", "BING_ADS_ENVIRONMENT", "BING_ADS_IDENTITY_PROVIDER", "BING_ADS_OAUTH_TENANT", "BING_ADS_ENABLE_WRITES"];
const present = (name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0;

let configuration = { ok: true };
try {
  const config = loadConfig();
  configuration = { ok: true, environment: config.environment, accounts: Object.keys(config.allowedAccounts).length, writesEnabled: config.enableWrites };
} catch (error) {
  configuration = { ok: false, error: error instanceof Error ? error.message : "Invalid configuration." };
}
const runtimeWarning = nodeRuntimeWarning();
const result = {
  package: "@getmcpads/bing-ads-mcp-server",
  node: process.versions.node,
  ...(runtimeWarning ? { runtimeWarning } : {}),
  required: required.map((name) => ({ name, present: present(name) })),
  optional: optional.map((name) => ({ name, present: present(name) })),
  configuration,
  note: "Values are never printed. No request is sent to Microsoft.",
};
if (runtimeWarning) console.error(runtimeWarning);
console.log(JSON.stringify(result, null, 2));
process.exit(configuration.ok ? 0 : 1);
