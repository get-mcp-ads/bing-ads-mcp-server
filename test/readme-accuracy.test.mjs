/**
 * The README documents every tool and resource by name. A tool renamed in the
 * code and not in the README is a documentation bug, and this test fails on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function introspect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js"],
    env: {
      PATH: process.env.PATH ?? "",
      BING_ADS_CLIENT_ID: "listing", BING_ADS_REFRESH_TOKEN: "token-for-listing", BING_ADS_DEVELOPER_TOKEN: "token-for-listing",
      BING_ADS_CUSTOMER_ID: "2", BING_ADS_ACCOUNT_IDS: "1", BING_ADS_ENABLE_WRITES: "true",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "readme-check", version: "1" }, { capabilities: {} });
  await client.connect(transport);
  const definitions = (await client.listTools()).tools;
  const tools = definitions.map((t) => t.name);
  const resources = (await client.listResources()).resources.map((r) => r.uri);
  await client.close();
  return { tools, resources, definitions };
}

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const surface = await introspect();

test("README documents every tool the server exposes", () => {
  const { tools } = surface;
  const cited = new Set([...README.matchAll(/`(bing_[a-z_]+)`/g)].map((m) => m[1]));
  const undocumented = tools.filter((t) => !cited.has(t));
  assert.deepEqual(undocumented, [], `Tools missing from README: ${undocumented.join(", ")}`);
  const invented = [...cited].filter((c) => !tools.includes(c));
  assert.deepEqual(invented, [], `README cites tools that do not exist: ${invented.join(", ")}`);
});

test("README documents every resource the server exposes", () => {
  const { resources } = surface;
  const cited = new Set([...README.matchAll(/`(bing-ads:\/\/[a-z0-9-]+)`/g)].map((m) => m[1]));
  const undocumented = resources.filter((r) => !cited.has(r));
  assert.deepEqual(undocumented, [], `Resources missing from README: ${undocumented.join(", ")}`);
  const invented = [...cited].filter((c) => !resources.includes(c));
  assert.deepEqual(invented, [], `README cites resources that do not exist: ${invented.join(", ")}`);
});

test("README tool counts match reality", () => {
  const { tools, resources, definitions } = surface;
  const writes = definitions.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
  const reads = tools.filter((t) => !writes.includes(t));

  assert.equal(reads.length, 20, "read tool count changed, update the README");
  assert.equal(writes.length, 23, "write tool count changed, update the README");
  assert.equal(resources.length, 1, "resource count changed, update the README");

  assert.match(README, new RegExp(`\\*\\*${reads.length} read tools\\*\\* · \\*\\*${writes.length} write tools\\*\\*, disabled by default\\.`));
  assert.match(README, new RegExp(`<b>${reads.length} read tools</b>`));
  assert.match(README, new RegExp(`<b>${writes.length} write tools</b>`));
  assert.match(README, new RegExp(`<b>${resources.length} resource${resources.length === 1 ? "" : "s"}</b>`));
  // Each table lists exactly its own kind of tool.
  const section = (label) => README.split(`<b>${label}</b>`)[1].split("</details>")[0];
  const rows = (text) => [...text.matchAll(/^\| `(bing_[a-z_]+)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(rows(section(`${reads.length} read tools`)), [...reads].sort());
  assert.deepEqual(rows(section(`${writes.length} write tools`)), [...writes].sort());

  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));
  for (const text of [pkg.description, server.description]) {
    assert.match(text, new RegExp(`${reads.length} read tools, ${writes.length} opt-in`));
  }
});

test("published prose uses no em dashes", () => {
  const files = readdirSync(new URL("../", import.meta.url)).filter((f) => f.endsWith(".md") || f === "NOTICE" || f === ".env.example");
  const walk = (dir, acc = []) => {
    for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, acc);
      else if (/\.(ts|mjs|json)$/.test(entry.name)) acc.push(`${dir}/${entry.name}`);
    }
    return acc;
  };
  const offenders = [];
  for (const file of [...files, "package.json", "server.json", ...walk("src"), ...walk("test"), ...walk("scripts")]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    text.split("\n").forEach((line, i) => { if (line.includes("\u2014")) offenders.push(`${file}:${i + 1}`); });
  }
  assert.deepEqual(offenders, [], `Em dashes are not used in this project. Rewrite the sentence instead of swapping the character. Found at: ${offenders.join(", ")}`);
});
