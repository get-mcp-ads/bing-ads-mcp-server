import { afterEach, describe, expect, it, vi } from "vitest";
import { readBingReport, reportReceipt, verifyReportReceipt } from "../../src/reporting.js";
import { SECRETS, json, makeZip, provider, tools } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());
const owned = () => json({ Account: { Id: 1, ParentCustomerId: 2, Name: "Old", LastModifiedTime: "2026-10-01T10:00:00" } });
const binding = { environment: "sandbox", identityProvider: "Microsoft" } as const;

const READ_ARGS: Record<string, Record<string, unknown>> = {
  bing_health_check: { accountId: "1" },
  bing_get_campaigns: { accountId: "1", campaignType: "Search" },
  bing_get_ad_groups: { accountId: "1", campaignId: "5", campaignType: "Search" },
  bing_get_ads: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", adTypes: ["ResponsiveSearch"] },
  bing_get_keywords: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6" },
  bing_get_targeting: { accountId: "1", campaignId: "5", campaignType: "Search", criterionType: "Age" },
  bing_get_audiences: { accountId: "1", type: "RemarketingList" },
  bing_get_uet_tags: { accountId: "1" },
  bing_get_conversion_goals: { accountId: "1", type: "Url" },
  bing_get_media: { accountId: "1", mediaIds: ["10"] },
  bing_get_videos: { accountId: "1" },
  bing_get_asset_groups: { accountId: "1", campaignId: "5" },
  bing_get_geo_file: { accountId: "1" },
  bing_list_ad_creatives: { accountId: "1" },
  bing_get_insights: { accountId: "1", reportType: "AccountPerformanceReportRequest", since: "2026-09-01", until: "2026-09-07", columns: ["Spend"] },
  bing_get_report: { accountId: "1", receipt: "x" },
};
const WRITE_ARGS: Record<string, Record<string, unknown>> = {
  bing_create_campaign: { accountId: "1", data: { Name: "test", CampaignType: "Search", DailyBudget: 5 } },
  bing_update_campaign: { accountId: "1", id: "5", campaignType: "Search", data: { Status: "Active" } },
  bing_create_ad_group: { accountId: "1", campaignId: "5", campaignType: "Search", data: { Name: "g" } },
  bing_update_ad_group: { accountId: "1", campaignId: "5", campaignType: "Search", id: "6", data: { Name: "g" } },
  bing_create_ad: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", data: { Type: "ResponsiveSearch" } },
  bing_update_ad: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", id: "7", data: { Type: "ResponsiveSearch" } },
  bing_create_keyword: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", data: { Text: "shoes", MatchType: "Exact" } },
  bing_update_keyword: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", id: "8", data: { Bid: { Amount: 1 } } },
  bing_create_audience: { accountId: "1", data: { Type: "RemarketingList", Name: "a" } },
  bing_update_audience: { accountId: "1", id: "9", data: { Type: "RemarketingList", Name: "a" } },
  bing_rename_campaign: { accountId: "1", campaignId: "5", campaignType: "Search", name: "New" },
  bing_rename_ad_group: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", name: "New" },
  bing_rename_account: { accountId: "1", name: "New name" },
  bing_import_video: { accountId: "1", sourceUrl: "https://cdn.example.com/a.mp4", description: "clip" },
  bing_update_video: { accountId: "1", videoId: "10", description: "clip" },
  bing_upload_image: { accountId: "1", base64: "iVBORw0KGgo=" },
  bing_create_asset_group: { accountId: "1", campaignId: "5", data: { Name: "ag" } },
  bing_create_uet_tag: { accountId: "1", data: { Name: "tag" } },
  bing_create_conversion_goal: { accountId: "1", data: { Name: "goal", Type: "Url" } },
  bing_add_campaign_targeting: { accountId: "1", campaignId: "5", campaignType: "Search", criterionType: "Targets", data: { Type: "BiddableCampaignCriterion" } },
  bing_update_campaign_targeting: { accountId: "1", campaignId: "5", campaignType: "Search", criterionType: "Targets", data: { Id: "11" } },
  bing_add_ad_group_targeting: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", criterionType: "Targets", data: { Type: "BiddableAdGroupCriterion" } },
  bing_update_ad_group_targeting: { accountId: "1", campaignId: "5", campaignType: "Search", adGroupId: "6", criterionType: "Targets", data: { Id: "12" } },
};

describe("account allowlist", () => {
  it("lists only configured accounts and flags a customer mismatch", async () => {
    const { run } = tools({ allowedAccounts: { "1": "2", "5": "6" } });
    provider(json({ User: { Id: 8 } }), json({ Accounts: [{ Id: 1, ParentCustomerId: 2, Name: "Allowed" }, { Id: 3, ParentCustomerId: 2, Name: "Private" }, { Id: 5, ParentCustomerId: 7, Name: "Other customer" }] }));
    const { data } = await run("bing_list_accounts");
    expect(data.accounts.map((a: { id: string }) => a.id)).toEqual(["1", "5"]);
    expect(data.accounts[1]).toMatchObject({ customerId: "7", configuredCustomerId: "6", customerMatches: false });
    expect(JSON.stringify(data)).not.toContain("Private");
    expect(data.missing).toEqual([]);
  });

  it("refuses unselected accounts on every account-bound tool before any request", async () => {
    const { run, entries } = tools();
    const { fetcher } = provider();
    const all: Record<string, Record<string, unknown>> = { ...READ_ARGS, ...WRITE_ARGS };
    for (const [name, entry] of entries) {
      if (!Object.hasOwn(entry.shape, "accountId")) continue;
      const args = { ...all[name], accountId: "3", ...(name === "bing_get_report" ? { receipt: reportReceipt(binding, "3", "job") } : {}) };
      for (const confirm of Object.hasOwn(entry.shape, "confirm") ? [false, true] : [undefined]) {
        const r = await run(name, confirm === undefined ? args : { ...args, confirm });
        expect(r.data.error, name).toContain("BING_ADS_ACCOUNT_IDS");
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops when Microsoft reports another owning customer", async () => {
    const { run } = tools();
    const { api } = provider(json({ Account: { Id: 1, ParentCustomerId: 3 } }));
    const r = await run("bing_create_campaign", { accountId: "1", confirm: true, data: { CampaignType: "Search", Name: "test" } });
    expect(r.data.error).toMatch(/scope mismatch/);
    expect(api()).toHaveLength(1);
  });
});

describe("preview versus confirm", () => {

  it("covers every write tool and previews each one without a request", async () => {
    const { run, entries } = tools();
    const writes = [...entries].filter(([, e]) => Object.hasOwn(e.shape, "confirm")).map(([name]) => name).sort();
    expect(writes).toEqual(Object.keys(WRITE_ARGS).sort());
    expect(writes).toHaveLength(23);
    const { fetcher } = provider();
    for (const name of writes) {
      const r = await run(name, WRITE_ARGS[name]);
      expect(r.isError, `${name}: ${r.text}`).toBe(false);
      expect(r.data.applied, name).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forces Paused on creation and flags activation as able to spend", async () => {
    const { run } = tools();
    provider();
    const created = await run("bing_create_campaign", WRITE_ARGS.bing_create_campaign);
    expect(created.data.body.Campaigns[0].Status).toBe("Paused");
    expect(created.data.activationMaySpend).toBe(false);
    expect((await run("bing_update_campaign", WRITE_ARGS.bing_update_campaign)).data.activationMaySpend).toBe(true);
    const goal = await run("bing_create_conversion_goal", WRITE_ARGS.bing_create_conversion_goal);
    expect(goal.data.body.ConversionGoals[0]).toMatchObject({ Status: "Paused", ExcludeFromBidding: true, Scope: "Account" });
  });

  it("refuses active creation, foreign payloads and cross-customer sharing locally", async () => {
    const { run } = tools();
    const { fetcher } = provider();
    for (const data of [{ CampaignType: "Search", Status: "Active" }, { CampaignType: "Search", AccountId: "3" }, { CampaignType: "Search", Id: "4" }, { CampaignType: "Search", CustomerShare: {} }]) {
      expect((await run("bing_create_campaign", { accountId: "1", data })).isError).toBe(true);
    }
    expect((await run("bing_create_audience", { accountId: "1", data: { Type: "RemarketingList", Scope: "Customer" } })).isError).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("applies a confirmed rename once, after verifying ownership", async () => {
    const { run } = tools();
    const { api, bodies } = provider(owned(), json({ Campaigns: [{ Id: 5 }] }), json({ PartialErrors: [] }));
    const r = await run("bing_rename_campaign", { ...WRITE_ARGS.bing_rename_campaign, confirm: true });
    expect(r.data).toMatchObject({ applied: true, operation: "updatecampaigns" });
    expect(api().map(([url, init]) => `${init!.method} ${new URL(String(url)).pathname}`)).toEqual([
      "POST /CustomerManagement/v13/Account/Query", "POST /CampaignManagement/v13/Campaigns/QueryByIds", "PUT /CampaignManagement/v13/Campaigns",
    ]);
    expect(bodies()[2]).toEqual({ AccountId: "1", Campaigns: [{ Id: "5", Name: "New" }] });
  });

  it("rewrites the account as read, except its name", async () => {
    const { run } = tools();
    const { bodies } = provider(owned(), json({}));
    await run("bing_rename_account", { accountId: "1", name: "FR_Search", confirm: true });
    expect(bodies()[1]).toEqual({ Account: { Id: 1, ParentCustomerId: 2, Name: "FR_Search", LastModifiedTime: "2026-10-01T10:00:00" } });
  });

  it("reports a partial application instead of claiming success", async () => {
    const { run } = tools();
    provider(owned(), json({ CampaignIds: [null], PartialErrors: [{ Index: 0, Code: 1234 }] }));
    const r = await run("bing_create_campaign", { ...WRITE_ARGS.bing_create_campaign, confirm: true });
    expect(r.data.applied).toBe("partial");
    expect(r.data.reconcile).toContain("Read back");
  });

  it("refuses a video update when the account does not return that video", async () => {
    const { run } = tools();
    const { api } = provider(owned(), json({ Videos: [] }));
    const r = await run("bing_update_video", { accountId: "1", videoId: "99", description: "x", confirm: true });
    expect(r.data.error).toMatch(/not in the selected account/);
    expect(api()).toHaveLength(2);
  });

  it("refuses non-public video sources without fetching them", async () => {
    const { run } = tools();
    const { fetcher } = provider();
    for (const sourceUrl of ["file:///tmp/a.mp4", "http://cdn.example.com/a.mp4", "https://localhost/a.mp4", "https://127.0.0.1/a.mp4", "https://169.254.169.254/a.mp4", "https://[::1]/a.mp4", "https://user:pw@cdn.example.com/a.mp4"]) {
      expect((await run("bing_import_video", { accountId: "1", sourceUrl, description: "x" })).isError, sourceUrl).toBe(true);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not register write tools unless writes are enabled", () => {
    const { entries } = tools({ enableWrites: false });
    expect([...entries.values()].some(e => Object.hasOwn(e.shape, "confirm"))).toBe(false);
    expect(entries.size).toBe(20);
  });
});

describe("reporting", () => {
  it("submits product totals in the chosen time zone with AccountNumber and a receipt", async () => {
    const { run } = tools();
    const { bodies } = provider(owned(), json({ ReportRequestId: "job" }));
    const r = await run("bing_get_insights", { accountId: "1", campaignId: "3", reportType: "ProductDimensionPerformanceReportRequest", aggregation: "Summary", reportTimeZone: "BrusselsCopenhagenMadridParis", returnOnlyCompleteData: true, since: "2026-09-01", until: "2026-09-07", columns: ["CampaignId", "MerchantProductId", "Spend"] });
    expect(r.data.status).toBe("Submitted");
    expect(bodies()[1].ReportRequest).toMatchObject({ Aggregation: "Summary", ReturnOnlyCompleteData: true, Columns: ["AccountNumber", "CampaignId", "MerchantProductId", "Spend"], Scope: { Campaigns: [{ AccountId: "1", CampaignId: "3" }] }, Time: { ReportTimeZone: "BrusselsCopenhagenMadridParis" } });
    expect(verifyReportReceipt(r.data.receipt, binding, "1")).toBe("job");
  });

  it("refuses incompatible columns and reversed ranges before calling Microsoft", async () => {
    const { run } = tools();
    const { fetcher } = provider();
    expect((await run("bing_get_insights", { accountId: "1", reportType: "AccountPerformanceReportRequest", since: "2026-09-01", until: "2026-09-07", columns: ["MerchantProductId"] })).data.error).toContain("incompatible");
    expect((await run("bing_get_insights", { accountId: "1", reportType: "AccountPerformanceReportRequest", since: "2026-09-07", until: "2026-09-01", columns: ["Spend"] })).data.error).toContain("reversed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds receipts to the account, environment and process key", () => {
    const receipt = reportReceipt(binding, "1", "job");
    expect(Buffer.from(receipt.split(".")[0]!, "base64url").toString()).not.toContain(SECRETS.refreshToken);
    expect(verifyReportReceipt(receipt, binding, "1")).toBe("job");
    expect(() => verifyReportReceipt(receipt, binding, "3")).toThrow();
    expect(() => verifyReportReceipt(receipt, { ...binding, environment: "production" }, "1")).toThrow();
    expect(() => verifyReportReceipt(receipt, binding, "1", Buffer.alloc(32, 7))).toThrow();
    expect(() => verifyReportReceipt(receipt, binding, "1", undefined, Date.now() + 3_700_000)).toThrow("expired");
  });

  it("polls, downloads a zipped report without credentials and keeps values as strings", async () => {
    const { run } = tools();
    const zip = makeZip({ "report.csv": 'AccountNumber,MerchantProductId,Spend\r\n000ABC,001-Sku,12.50\r\n' });
    const { api } = provider(owned(), json({ ReportRequestStatus: { Status: "Success", ReportDownloadUrl: "https://bingadsappsstorageprod.blob.core.windows.net/download/r.zip?sig=x" } }), new Response(zip));
    const receipt = reportReceipt(binding, "1", "job");
    const r = await run("bing_get_report", { accountId: "1", receipt });
    expect(r.data.rows).toEqual([{ AccountNumber: "000ABC", MerchantProductId: "001-Sku", Spend: "12.50" }]);
    const download = api()[2]![1]!;
    expect(download.headers).toBeUndefined();
    expect(download.redirect).toBe("error");
  });

  it("returns Pending without downloading", async () => {
    const { run } = tools();
    const { api } = provider(owned(), json({ ReportRequestStatus: { Status: "Pending" } }));
    const r = await run("bing_get_report", { accountId: "1", receipt: reportReceipt(binding, "1", "job") });
    expect(r.data).toMatchObject({ status: "Pending", rows: null });
    expect(api()).toHaveLength(2);
  });

  it("refuses untrusted, private and plain-HTTP report hosts without a request", async () => {
    const { fetcher } = provider();
    for (const url of ["https://example.com/r.zip", "http://reporting.api.bingads.microsoft.com/r.zip", "https://127.0.0.1/r.zip", "https://reporting.api.bingads.microsoft.com:8443/r.zip", "https://evil.blob.core.windows.net.example.com/r.zip"]) {
      await expect(readBingReport(url), url).rejects.toThrow(/untrusted/);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("decodes UTF-8 and UTF-16 byte-order marks, quoted commas and embedded newlines", async () => {
    const csv = 'AccountId,CampaignName,Spend\r\n1,"Été, ""quoted""\nline",0\r\n';
    const utf16 = new Uint8Array(2 + csv.length * 2); utf16.set([0xff, 0xfe]);
    const view = new DataView(utf16.buffer); for (let i = 0; i < csv.length; i++) view.setUint16(2 + 2 * i, csv.charCodeAt(i), true);
    for (const bytes of [new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(csv)]), makeZip({ "report.csv": utf16 }), makeZip({ "report.csv": csv }, 0)]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
      const r = await readBingReport("https://reporting.api.sandbox.bingads.microsoft.com/report.zip");
      expect(r.rows).toEqual([{ AccountId: "1", CampaignName: 'Été, "quoted"\nline', Spend: "0" }]);
    }
  });

  it("refuses malformed CSV, archives with several CSV files and archives that expand past the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("AccountId,Spend\n1,120\n2\n")));
    await expect(readBingReport("https://reporting.api.bingads.microsoft.com/r.csv")).rejects.toThrow(/incomplete row/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(makeZip({ "a.csv": "AccountId\n1\n", "b.csv": "AccountId\n2\n" }))));
    await expect(readBingReport("https://reporting.api.bingads.microsoft.com/r.zip")).rejects.toThrow(/exactly one CSV/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(makeZip({ "big.csv": "A".repeat(11_000_000) }))));
    await expect(readBingReport("https://reporting.api.bingads.microsoft.com/r.zip")).rejects.toThrow(/size limit/);
  });
});

describe("redaction and errors", () => {
  it("removes credentials from tool results, by key and by value", async () => {
    const { run } = tools();
    provider(json({ Account: { Id: 1, ParentCustomerId: 2, Note: `token ${SECRETS.accessToken}`, AuthenticationToken: "opaque-value" } }));
    const r = await run("bing_health_check", { accountId: "1" });
    expect(r.text).not.toContain(SECRETS.accessToken);
    expect(r.text).not.toContain("opaque-value");
    expect(r.data.Account.AuthenticationToken).toBe("[REDACTED]");
  });

  it("returns provider failures as tool errors with codes and no message body", async () => {
    const { run } = tools();
    provider(json({ Errors: [{ Code: 106, ErrorCode: "UserIsNotAuthorized", Message: SECRETS.refreshToken }] }, 401));
    const r = await run("bing_get_campaigns", { accountId: "1", campaignType: "Search" });
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain("106 UserIsNotAuthorized");
    expect(r.text).not.toContain(SECRETS.refreshToken);
  });
});
