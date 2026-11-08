/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BingConfig } from "./config.js";

/** What this server covers, how its writes behave and what it does not do. */
export function setupGuide(config: BingConfig) {
  return {
    environment: config.environment,
    identityProvider: config.identityProvider,
    writesEnabled: config.enableWrites,
    configuredAccounts: Object.keys(config.allowedAccounts).length,
    coverage: "Account discovery, campaigns, ad groups, ads, keywords, configured targeting, audiences, UET tags, conversion goals, image and video metadata, Performance Max asset groups and the asynchronous Reporting API. Create and update tools take native Microsoft REST fields; read bing_get_write_schema first.",
    accounts: "Only accounts listed in BING_ADS_ACCOUNT_IDS are reachable. Each call names an accountId. Its customer ID comes from the configuration and must equal the ParentCustomerId that Microsoft returns for the account, or the call stops.",
    safety: "Write tools exist only when BING_ADS_ENABLE_WRITES=true. Every write previews unless confirm is true. Campaigns, ad groups, ads, keywords and asset groups are created Paused. Conversion goals are created Paused and excluded from bidding. Setting Status to Active can start spending. Nested updates can replace existing lists or settings, so read the current configuration first. No write is retried automatically.",
    reporting: "bing_get_insights submits a report and returns a receipt that is valid for one hour in this server process. Poll it with bing_get_report. A report returns at most 2,000 rows; narrow the date range when truncated is true. Values stay as Microsoft wrote them, in account currency units.",
    limits: "Microsoft applies per-user and per-account call limits. Error 117 means the call rate was exceeded; wait for the window to reset.",
    limitations: [
      "This standalone server is tested offline with synthetic responses. The hosted connector it is ported from was checked against the Microsoft sandbox in September 2026 for Search, Audience, Dynamic Search and Performance Max entity chains.",
      "Video ad creation, Shopping, Hotel and app campaigns, and populated report downloads were not validated.",
      "No billing, payment, bulk upload, Ad Insight or account-sharing operations are exposed.",
    ],
  };
}
