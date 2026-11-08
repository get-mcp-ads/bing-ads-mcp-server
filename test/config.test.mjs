import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, validateConfig } from "../src/config.ts";

const env = {
  BING_ADS_CLIENT_ID: "client", BING_ADS_REFRESH_TOKEN: "private-refresh-token", BING_ADS_DEVELOPER_TOKEN: "private-developer-token",
  BING_ADS_CUSTOMER_ID: "200", BING_ADS_ACCOUNT_IDS: "100, 101:300",
};

test("a complete environment loads read-only in production by default", () => {
  const config = loadConfig(env);
  assert.equal(config.environment, "production");
  assert.equal(config.identityProvider, "Microsoft");
  assert.equal(config.tenant, "common");
  assert.equal(config.enableWrites, false);
  assert.deepEqual(config.allowedAccounts, { "100": "200", "101": "300" });
});

test("only the exact value true enables writes", () => {
  assert.equal(loadConfig({ ...env, BING_ADS_ENABLE_WRITES: "true" }).enableWrites, true);
  for (const value of ["1", "yes", "TRUE", " true"]) assert.throws(() => loadConfig({ ...env, BING_ADS_ENABLE_WRITES: value }), /exactly true or false/);
});

test("configuration errors are actionable and never reveal a secret", () => {
  const cases = [
    [{ ...env, BING_ADS_CLIENT_ID: "" }, /BING_ADS_CLIENT_ID/],
    [{ ...env, BING_ADS_REFRESH_TOKEN: "" }, /BING_ADS_REFRESH_TOKEN/],
    [{ ...env, BING_ADS_ACCOUNT_IDS: "" }, /BING_ADS_ACCOUNT_IDS/],
    [{ ...env, BING_ADS_ACCOUNT_IDS: "F123456" }, /account number/],
    [{ ...env, BING_ADS_ACCOUNT_IDS: "../100" }, /numeric account IDs/],
    [{ ...env, BING_ADS_CUSTOMER_ID: "" }, /BING_ADS_CUSTOMER_ID/],
    [{ ...env, BING_ADS_ACCOUNT_IDS: "100:1,100:2" }, /different customer/],
    [{ ...env, BING_ADS_DEVELOPER_TOKEN: "" }, /own Microsoft Advertising developer token/],
    [{ ...env, BING_ADS_DEVELOPER_TOKEN: "BBD37VB98" }, /own Microsoft Advertising developer token/],
    [{ ...env, BING_ADS_ENVIRONMENT: "staging" }, /BING_ADS_ENVIRONMENT/],
    [{ ...env, BING_ADS_IDENTITY_PROVIDER: "Google" }, /BING_ADS_CLIENT_SECRET/],
    [{ ...env, BING_ADS_OAUTH_TENANT: "../evil" }, /BING_ADS_OAUTH_TENANT/],
    [{ ...env, BING_ADS_ACCOUNT_IDS: Array.from({ length: 201 }, (_, i) => String(i + 1)).join(",") }, /between 1 and 200/],
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => loadConfig(value), error => pattern.test(error.message) && !error.message.includes("private-refresh-token") && !error.message.includes("private-developer-token"), String(pattern));
  }
});

test("sandbox works without a developer token", () => {
  const config = loadConfig({ ...env, BING_ADS_ENVIRONMENT: "sandbox", BING_ADS_DEVELOPER_TOKEN: "" });
  assert.equal(config.environment, "sandbox");
  assert.throws(() => validateConfig({ ...config, allowedAccounts: {} }), /BING_ADS_ACCOUNT_IDS/);
});
