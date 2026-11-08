#!/usr/bin/env node
/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * stdout carries the MCP protocol. Every diagnostic goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { nodeRuntimeWarning } from "./runtime-check.js";
import { createServer } from "./server.js";

const warning = nodeRuntimeWarning();
if (warning) process.stderr.write(`[bing-ads-mcp] ${warning}\n`);

try {
  const config = loadConfig();
  await createServer(config).connect(new StdioServerTransport());
  process.stderr.write(`[bing-ads-mcp] ${config.environment}, ${Object.keys(config.allowedAccounts).length} account(s), writes ${config.enableWrites ? "enabled" : "disabled"}\n`);
} catch (error) {
  process.stderr.write(`[bing-ads-mcp] ${error instanceof Error ? error.message : "Microsoft Advertising server failed to start."}\n`);
  process.exitCode = 1;
}
