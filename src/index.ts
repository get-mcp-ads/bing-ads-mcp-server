/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export { createServer, PACKAGE_VERSION } from "./server.js";
export { loadConfig, validateConfig } from "./config.js";
export { nodeRuntimeWarning } from "./runtime-check.js";
export type { BingConfig, BingConfigInput } from "./config.js";
