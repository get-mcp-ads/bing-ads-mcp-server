/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BingClient } from "./client.js";
import { validateConfig, type BingConfigInput } from "./config.js";
import { installToolQuality } from "./tool-quality.js";
import { registerBingReads, registerBingWrites } from "./tools.js";

export const PACKAGE_VERSION = "1.0.0";

export function createServer(input: BingConfigInput): McpServer {
  const config = validateConfig(input);
  const server = new McpServer({
    name: "bing-ads-mcp", version: PACKAGE_VERSION, title: "Microsoft Advertising",
    websiteUrl: "https://www.getmcpads.com/tools/bing-ads",
    icons: [{ src: "https://mcp.getmcpads.com/icon.svg", mimeType: "image/svg+xml" }],
  });
  installToolQuality(server);
  // One client per server, so the in-memory access token is shared by every tool.
  const api = new BingClient(config);
  registerBingReads(server as never, config, api);
  if (config.enableWrites) registerBingWrites(server as never, config, api);
  return server;
}
