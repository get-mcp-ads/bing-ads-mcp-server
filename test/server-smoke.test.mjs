/**
 * Starts the built CLI over stdio, as an MCP client does. stdout must carry
 * only the protocol: startup diagnostics and configuration errors go to stderr.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = {
  PATH: process.env.PATH ?? "",
  BING_ADS_CLIENT_ID: "smoke-client", BING_ADS_REFRESH_TOKEN: "smoke-refresh-token", BING_ADS_DEVELOPER_TOKEN: "smoke-developer-token",
  BING_ADS_CUSTOMER_ID: "2", BING_ADS_ACCOUNT_IDS: "1",
};

test("the read-only server lists 20 read tools and no write tool over stdio", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js"], env, stderr: "pipe" });
  const client = new Client({ name: "bing-ads-smoke", version: "0.0.0" });
  try {
    await client.connect(transport, { timeout: 15000 });
    const { tools } = await client.listTools(undefined, { timeout: 15000 });
    assert.equal(tools.length, 20);
    assert.ok(tools.every(t => t.annotations.readOnlyHint === true));
    for (const name of ["bing_list_accounts", "bing_health_check", "bing_get_campaigns", "bing_get_insights", "bing_get_report", "bing_get_setup_guide"]) {
      assert.ok(tools.some(t => t.name === name), `missing ${name}`);
    }
    const { resources } = await client.listResources(undefined, { timeout: 15000 });
    assert.deepEqual(resources.map(r => r.uri), ["bing-ads://guide"]);
  } finally {
    await transport.close().catch(() => undefined);
  }
});

test("a configuration error goes to stderr, never to stdout, and reveals no secret", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js"], { env: { ...env, BING_ADS_DEVELOPER_TOKEN: "" }, encoding: "utf8", input: "", timeout: 15000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /BING_ADS_DEVELOPER_TOKEN/);
  assert.ok(!result.stderr.includes("smoke-refresh-token"));
});
