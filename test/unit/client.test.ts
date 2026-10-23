import { afterEach, describe, expect, it, vi } from "vitest";
import { BingClient, bingId } from "../../src/client.js";
import { validateConfig } from "../../src/config.js";
import { API_HOSTS } from "../../src/hosts.js";
import { parseJsonPreservingIds } from "../../src/http.js";
import { BING_OPERATIONS } from "../../src/operations.js";
import { refreshAccessToken, tokenEndpoint } from "../../src/oauth.js";
import { SECRETS, base, json, provider, token } from "./helpers.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const scope = { accountId: "1", customerId: "2" };
const client = (overrides = {}) => new BingClient(validateConfig({ ...base, ...overrides }));

describe("Microsoft Advertising REST transport", () => {
  it("pins every operation to a REST v13 path on a declared service", () => {
    for (const spec of Object.values(BING_OPERATIONS)) {
      expect(spec.path).toMatch(/^\/(CampaignManagement|CustomerManagement|Reporting)\/v13\//);
      expect(Object.keys(API_HOSTS.production)).toContain(spec.service);
    }
    expect(API_HOSTS.production.campaign).toBe(API_HOSTS.sandbox.campaign.replace(".sandbox.", "."));
  });

  it("sends scoped sandbox requests with the universal developer token and no redirects", async () => {
    const { api } = provider(json({ Campaigns: [] }));
    await client().request("getcampaignsbyaccountid", { AccountId: "1" }, scope);
    const [url, init] = api()[0]!;
    expect(url).toBe("https://campaign.api.sandbox.bingads.microsoft.com/CampaignManagement/v13/Campaigns/QueryByAccountId");
    expect(JSON.parse(String(init!.body)).ReturnAdditionalFields).toBe("CpvCpmBiddingScheme");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: `Bearer ${SECRETS.accessToken}`, DeveloperToken: "BBD37VB98", CustomerAccountId: "1", CustomerId: "2" } });
    expect((init!.headers as Record<string, string>).IdentityProvider).toBeUndefined();
  });

  it("uses the configured developer token and production hosts in production", async () => {
    const { api } = provider(json({ Campaigns: [] }));
    await client({ environment: "production", developerToken: SECRETS.developerToken }).request("getcampaignsbyaccountid", { AccountId: "1" }, scope);
    expect(api()[0]![0]).not.toContain(".sandbox.");
    expect((api()[0]![1]!.headers as Record<string, string>).DeveloperToken).toBe(SECRETS.developerToken);
  });

  it("adds the Google identity header for Google-authenticated users", async () => {
    const { api, fetcher } = provider(json({ Campaigns: [] }));
    await client({ identityProvider: "Google" }).request("getcampaignsbyaccountid", { AccountId: "1" }, scope);
    expect((api()[0]![1]!.headers as Record<string, string>).IdentityProvider).toBe("Google");
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://oauth2.googleapis.com/token");
  });

  it("does not let a caller change the environment after construction", async () => {
    const { api } = provider(json({ User: { Id: "8" } }));
    const mutable = validateConfig(base);
    const c = new BingClient(mutable);
    (mutable as { environment: string }).environment = "production";
    await c.request("getuser", { UserId: null });
    expect(api()[0]![0]).toContain(".sandbox.");
  });

  it("refuses unselected accounts, scope mismatches and unknown operations before any request", async () => {
    const { fetcher } = provider();
    const c = client();
    await expect(c.request("getcampaignsbyaccountid", { AccountId: "3" }, scope)).rejects.toThrow("mismatch");
    await expect(c.request("getcampaignsbyaccountid", { AccountId: "3" }, { accountId: "3", customerId: "2" })).rejects.toThrow("BING_ADS_ACCOUNT_IDS");
    await expect(c.request("getcampaignsbyaccountid", { AccountId: "1" }, { accountId: "1", customerId: "9" })).rejects.toThrow("BING_ADS_ACCOUNT_IDS");
    await expect(c.request("getcampaignsbyaccountid", {})).rejects.toThrow("scope required");
    await expect(c.request("getaccount", { AccountId: "3" }, scope)).rejects.toThrow("mismatch");
    await expect(c.request("constructor" as never, {})).rejects.toThrow("Unsupported");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses write operations when writes are disabled, before any request", async () => {
    const { fetcher } = provider();
    await expect(client({ enableWrites: false }).request("addcampaigns", { AccountId: "1" }, scope)).rejects.toThrow("BING_ADS_ENABLE_WRITES");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps successful IDs and PartialErrors from the same HTTP 200", async () => {
    const mixed = { CampaignIds: ["123", null], PartialErrors: [{ Index: 1, Code: 1234 }] };
    const { api } = provider(json(mixed));
    expect(await client().request("addcampaigns", { AccountId: "1" }, scope)).toEqual(mixed);
    expect(api()).toHaveLength(1);
  });

  it("treats an error body inside HTTP 200 as a failure", async () => {
    provider(json({ OperationErrors: [{ Code: 1100, ErrorCode: "CampaignServiceInvalidAccountId", Message: "x" }] }));
    await expect(client().request("getcampaignsbyaccountid", { AccountId: "1" }, scope)).rejects.toThrow("HTTP 200 (1100 CampaignServiceInvalidAccountId)");
  });

  it("maps documented error codes without echoing provider messages", async () => {
    provider(json({ Errors: [{ Code: 117, ErrorCode: "CallRateExceeded", Message: SECRETS.accessToken }] }, 429, { TrackingId: "abc-123" }));
    const error = await client().request("getcampaignsbyaccountid", { AccountId: "1" }, scope).catch(e => e as Error);
    expect(error.message).toContain("117 CallRateExceeded");
    expect(error.message).toContain("Wait before retrying");
    expect(error.message).toContain("TrackingId abc-123");
    expect(error.message).not.toContain(SECRETS.accessToken);
  });

  it("never replays an uncertain write and says its outcome is unknown", async () => {
    const fetcher = vi.fn(async (url: unknown) => String(url).includes("/oauth2/") ? token() : Promise.reject(new TypeError(SECRETS.accessToken)));
    vi.stubGlobal("fetch", fetcher);
    const error = await client().request("addcampaigns", { AccountId: "1" }, scope).catch(e => e as Error);
    expect(error.message).toContain("outcome is unknown");
    expect(error.message).not.toContain(SECRETS.accessToken);
    expect(fetcher.mock.calls.filter(([url]) => !String(url).includes("/oauth2/"))).toHaveLength(1);
  });

  it("rejects malformed and oversized responses", async () => {
    provider(new Response("not-json"));
    await expect(client().request("getuser", { UserId: null })).rejects.toThrow("invalid_response");
    provider(new Response("{}", { headers: { "content-length": "20000000" } }));
    await expect(client().request("getuser", { UserId: null })).rejects.toThrow("exceeded");
  });

  it("keeps 64-bit IDs exact instead of rounding them", () => {
    expect(parseJsonPreservingIds('{"Id":9223372036854775807,"Small":42,"Spend":1.25}')).toEqual({ Id: "9223372036854775807", Small: 42, Spend: 1.25 });
    expect(bingId("9223372036854775807")).toBe("9223372036854775807");
    expect(() => bingId(9223372036854775807)).toThrow();
    expect(() => bingId("9223372036854775808")).toThrow();
    expect(() => bingId("F123456")).toThrow();
  });

  it("discovers every page with owning customer IDs and no user personal data", async () => {
    const accounts = Array.from({ length: 100 }, (_, i) => ({ Id: i + 1, ParentCustomerId: 999, Name: `Account ${i}`, Number: `F${i}`, CurrencyCode: "EUR" }));
    const { bodies } = provider(json({ User: { Id: 8, UserName: "someone@example.com" } }), json({ Accounts: accounts }), json({ Accounts: [{ Id: 101, ParentCustomerId: 1000, Name: "Last" }] }));
    const results = await client().accounts();
    expect(results).toHaveLength(101);
    expect(results.at(-1)).toEqual({ id: "101", customerId: "1000", name: "Last" });
    expect(JSON.stringify(results)).not.toContain("someone@example.com");
    expect(bodies()[2].PageInfo.Index).toBe(1);
  });

  it("refuses a repeated page rather than declaring discovery complete", async () => {
    const page = { Accounts: Array.from({ length: 100 }, (_, i) => ({ Id: i + 1, ParentCustomerId: 9 })) };
    provider(json({ User: { Id: 8 } }), ...Array.from({ length: 3 }, () => json(page)));
    await expect(client().accounts()).rejects.toThrow("pagination repeated");
  });
});

describe("OAuth refresh in memory", () => {
  it("refreshes once, shares the token across concurrent calls and renews it before expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tokens: string[] = [];
    const fetcher = vi.fn(async (url: unknown, init: RequestInit = {}) => {
      if (String(url).includes("/oauth2/")) {
        const form = init.body as URLSearchParams;
        tokens.push(String(form.get("refresh_token")));
        return token(`access-${tokens.length}`, { refresh_token: `rotated-${tokens.length}` });
      }
      return json({ User: { Id: 1 } });
    });
    vi.stubGlobal("fetch", fetcher);
    const c = client();
    await Promise.all([c.request("getuser", { UserId: null }), c.request("getuser", { UserId: null })]);
    expect(tokens).toEqual([SECRETS.refreshToken]);
    vi.setSystemTime(Date.now() + 3_550_000);
    await c.request("getuser", { UserId: null });
    expect(tokens).toEqual([SECRETS.refreshToken, "rotated-1"]);
    const auth = fetcher.mock.calls.filter(([url]) => !String(url).includes("/oauth2/")).map(([, init]) => (init!.headers as Record<string, string>).Authorization);
    expect(auth).toEqual(["Bearer access-1", "Bearer access-1", "Bearer access-2"]);
    expect(c.secrets()).toContain("rotated-2");
  });

  it("posts the Microsoft scope, the tenant endpoint and no redirect", async () => {
    const fetcher = vi.fn(async () => token());
    vi.stubGlobal("fetch", fetcher);
    await refreshAccessToken({ identityProvider: "Microsoft", clientId: "client", clientSecret: undefined, tenant: "contoso.onmicrosoft.com" }, "refresh");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token");
    expect(init.redirect).toBe("error");
    const form = init.body as URLSearchParams;
    expect(form.get("scope")).toBe("https://ads.microsoft.com/msads.manage offline_access");
    expect(form.get("client_secret")).toBeNull();
    expect(() => tokenEndpoint({ identityProvider: "Microsoft", tenant: "../evil" })).toThrow();
  });

  it("keeps the previous refresh token when the provider does not rotate it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => token("access")));
    expect((await refreshAccessToken({ identityProvider: "Google", clientId: "c", clientSecret: "s", tenant: "common" }, "old")).refreshToken).toBe("old");
  });

  it("never echoes the OAuth error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_grant", error_description: SECRETS.clientSecret }, 400)));
    const error = await refreshAccessToken({ identityProvider: "Microsoft", clientId: "c", clientSecret: SECRETS.clientSecret, tenant: "common" }, "old").catch(e => e as Error);
    expect(error.message).toContain("HTTP 400 (invalid_grant)");
    expect(error.message).not.toContain(SECRETS.clientSecret);
  });
});
