/**
 * Every outbound call carries a bearer token or a client secret. Following a
 * redirect would forward that credential to whatever host the redirect names,
 * so no fetch in this codebase may omit `redirect: "error"`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

function sourceFiles(dir = "src", acc = []) {
  for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, acc);
    else if (entry.name.endsWith(".ts")) acc.push(`${dir}/${entry.name}`);
  }
  return acc;
}

test("every fetch refuses to follow redirects", () => {
  const offenders = [];
  let calls = 0;
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    let index = text.indexOf("fetch(");
    while (index !== -1) {
      calls++;
      // The options object of a fetch call ends at the first `});` that follows.
      const tail = text.slice(index, index + 1200);
      const end = tail.indexOf("});");
      const call = end === -1 ? tail : tail.slice(0, end);
      if (!call.includes('redirect: "error"')) offenders.push(`${file}:${text.slice(0, index).split("\n").length}`);
      index = text.indexOf("fetch(", index + 1);
    }
  }
  assert.ok(calls >= 3, "expected the API, token and report download calls");
  assert.deepEqual(offenders, [], `These fetch calls may follow a redirect and leak credentials: ${offenders.join(", ")}`);
});

test("the only hosts named in src are the Microsoft Advertising API and OAuth token hosts, all in src/hosts.ts", () => {
  const hosts = new Set();
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of text.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].replace(/\.$/, "").toLowerCase();
      // Documentation links, SPDX headers, the server icon and the OAuth scope
      // identifier (ads.microsoft.com/msads.manage) are not call targets.
      if (["mcp.getmcpads.com", "www.getmcpads.com", "github.com", "learn.microsoft.com", "ads.microsoft.com"].includes(host)) continue;
      hosts.add(host);
    }
  }
  assert.deepEqual([...hosts].sort(), [
    "campaign.api.bingads.microsoft.com", "campaign.api.sandbox.bingads.microsoft.com",
    "clientcenter.api.bingads.microsoft.com", "clientcenter.api.sandbox.bingads.microsoft.com",
    "login.microsoftonline.com", "oauth2.googleapis.com",
    "reporting.api.bingads.microsoft.com", "reporting.api.sandbox.bingads.microsoft.com",
  ], "A new outbound host appeared. That is a deliberate decision, not an accident.");
  const hostsFile = readFileSync(new URL("../src/hosts.ts", import.meta.url), "utf8");
  for (const host of hosts) assert.ok(hostsFile.includes(`https://${host}`), `${host} must be declared in src/hosts.ts`);
  for (const file of sourceFiles().filter(f => f !== "src/hosts.ts")) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const host of hosts) assert.ok(!text.includes(`https://${host}`), `${file} names ${host}; declare hosts only in src/hosts.ts`);
  }
});
