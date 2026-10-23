/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";
import { BingClient, bingId, type BingRow, type BingScope } from "./client.js";
import { isBingId, type BingConfig } from "./config.js";
import { bingAdCreatives } from "./creatives.js";
import { setupGuide } from "./guide.js";
import { redactSecretFields, redactText } from "./http.js";
import type { BingOperation } from "./operations.js";
import { PARAMETER_DESCRIPTIONS as D } from "./parameter-descriptions.js";
import { BING_REPORT_TIMEZONES, pollBingReport, reportReceipt, verifyReportReceipt } from "./reporting.js";
import { isPublicHttpsUrl } from "./safety.js";
import reportColumns from "./report-columns.json";
import schema from "./schema.json";

type Shape = Record<string, z.ZodTypeAny>;
export type Collector = {
  tool(name: string, description: string, shape: Shape, handler: (args: BingRow) => Promise<unknown>): void;
  resource?(name: string, uri: string, read: () => Promise<unknown>): void;
};

const id = (description: string) => z.string().refine(isBingId, "Use a numeric Microsoft Advertising ID.").describe(description);
const ids = (description: string, max = 100) => z.array(id("Numeric Microsoft Advertising ID.")).min(1).max(max).describe(description);
const accountId = id(D.accountId!);
const campaignType = z.enum(["Search", "Shopping", "Audience", "PerformanceMax", "Hotel"]).describe(D.campaignType!);
const account = { accountId };
const campaign = { ...account, campaignId: id(D.campaignId!), campaignType };
const group = { ...campaign, adGroupId: id(D.adGroupId!) };
const native = z.record(z.unknown()).describe(D.data!);
const confirm = z.boolean().default(false).describe(D.confirm!);
const REPORT_TYPES = Object.keys(reportColumns.reports) as [keyof typeof reportColumns.reports, ...(keyof typeof reportColumns.reports)[]];
const ENTITIES = Object.keys(schema.entities) as [keyof typeof schema.entities, ...(keyof typeof schema.entities)[]];

const PREVIEW_MESSAGE = "Preview only, nothing was sent. Ask the user to approve this exact change, then repeat the same call with confirm: true.";

/** Shared rename preview: nothing is sent, the confirmed call applies this exact change. */
export function renamePreview(action: string, target: string, newName: string, details: Record<string, unknown> = {}) {
  return { applied: false, action, change: { target, newName, ...details }, message: PREVIEW_MESSAGE };
}

function setup(collector: Collector, config: BingConfig, api: BingClient) {
  const allowed = config.allowedAccounts;
  const output = (data: unknown, error = false) => ({
    ...(error ? { isError: true } : {}),
    content: [{ type: "text" as const, text: redactText(JSON.stringify(redactSecretFields(data), null, 2), api.secrets()) }],
  });
  /** The allowlist check that runs before every account-bound request. */
  const scope = (a: BingRow): BingScope => {
    const selected = bingId(a.accountId);
    if (!Object.hasOwn(allowed, selected)) throw new Error("Microsoft Advertising account is not in BING_ADS_ACCOUNT_IDS.");
    return { accountId: selected, customerId: bingId(allowed[selected]) };
  };
  const call = (a: BingRow, op: BingOperation, body: BingRow) => api.request(op, body, scope(a));
  const list = (r: BingRow, field: string): BingRow[] => {
    if (!Array.isArray(r[field])) throw new Error("Microsoft Advertising returned an incomplete entity list.");
    return (r[field] as unknown[]).filter(v => v && typeof v === "object") as BingRow[];
  };
  /** Verifies the account, then the campaign and ad group, against Microsoft before use. */
  const own = async (a: BingRow, level: "account" | "campaign" | "group" = "account") => {
    const selected = scope(a);
    const r = (await call(a, "getaccount", { AccountId: selected.accountId })).Account as BingRow | undefined;
    if (!r || bingId(r.Id) !== selected.accountId || bingId(r.ParentCustomerId) !== selected.customerId) {
      throw new Error("Microsoft Advertising account/customer scope mismatch. Check the customer ID configured for this account.");
    }
    if (level === "account") return r;
    const campaigns = list(await call(a, "getcampaignsbyids", { AccountId: selected.accountId, CampaignIds: [a.campaignId], CampaignType: a.campaignType }), "Campaigns");
    if (!campaigns.some(c => String(c.Id) === a.campaignId)) throw new Error("Microsoft Advertising campaign is not in the selected account and type.");
    if (level === "group") {
      const groups = list(await call(a, "getadgroupsbyids", { CampaignId: a.campaignId, AdGroupIds: [a.adGroupId] }), "AdGroups");
      if (!groups.some(g => String(g.Id) === a.adGroupId)) throw new Error("Microsoft Advertising ad group is not in the selected campaign.");
    }
    return r;
  };
  const add = (name: string, description: string, shape: Shape, fn: (a: BingRow) => Promise<unknown>) => collector.tool(`bing_${name}`, description, shape, async raw => {
    try { return output(await fn(z.object(shape).strict().parse(raw ?? {}))); }
    catch (e) {
      const message = e instanceof z.ZodError ? `Invalid arguments: ${e.issues.map(i => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}` : e instanceof Error ? e.message : "Microsoft Advertising request failed.";
      return output({ error: message, retry: Object.hasOwn(shape, "confirm") ? "Reconcile an uncertain write before retrying. A local preview is not provider acceptance." : "Fix the request or wait before retrying." }, true);
    }
  });
  return { scope, call, list, own, add, output };
}

/** Confirmed write result. PartialErrors means some items were refused while others were applied. */
function applied(operation: string, response: BingRow) {
  const partial = Array.isArray(response.PartialErrors) && response.PartialErrors.some(Boolean);
  return { applied: partial ? "partial" : true, operation, response, ...(partial ? { reconcile: "Some items were refused and the others were applied. Read back before resending only the refused items." } : {}) };
}

export function registerBingReads(collector: Collector, config: BingConfig, api: BingClient) {
  const { scope, call, own, add } = setup(collector, config, api);
  const allowed = config.allowedAccounts;

  add("list_accounts", "List the accounts in BING_ADS_ACCOUNT_IDS that this user can reach, with name, number, currency, status and owning customer. Discovery pages through every account Microsoft returns, then keeps only the configured ones.", {}, async () => {
    const found = (await api.accounts()).filter(a => Object.hasOwn(allowed, a.id));
    return {
      accounts: found.map(a => ({ ...a, configuredCustomerId: allowed[a.id], customerMatches: allowed[a.id] === a.customerId })),
      missing: Object.keys(allowed).filter(accountId => !found.some(a => a.id === accountId)),
      selectedAccountsOnly: true,
    };
  });
  add("health_check", "Read the selected account and confirm the environment, owning customer and currency. This does not validate every feature.", account, async a => {
    const accountRecord = await own(a);
    return { environment: config.environment, identityProvider: config.identityProvider, writesEnabled: config.enableWrites, scope: scope(a), Account: accountRecord };
  });
  add("get_campaigns", "Read native campaign configuration, budget, settings and status for one campaign type. Repeat for other types to inventory the whole account.", { ...account, campaignType: campaignType.describe("Campaign type to read. Call once per type for a full inventory.") }, async a => {
    await own(a); return call(a, "getcampaignsbyaccountid", { AccountId: a.accountId, CampaignType: a.campaignType });
  });
  add("get_ad_groups", "Read ad groups and their native configuration in an owned campaign.", campaign, async a => {
    await own(a, "campaign"); return call(a, "getadgroupsbycampaignid", { CampaignId: a.campaignId });
  });
  add("get_ads", "Read ads with their native creative assets, URLs and status. adTypes controls which formats Microsoft returns.", {
    ...group, adTypes: z.array(z.enum(["ResponsiveSearch", "ResponsiveAd", "DynamicSearch", "Product", "AppInstall", "ExpandedText", "Text"])).min(1).max(7).describe("Ad formats to return. Microsoft omits formats that are not listed."),
  }, async a => {
    await own(a, "group"); return call(a, "getadsbyadgroupid", { AdGroupId: a.adGroupId, AdTypes: a.adTypes });
  });
  add("get_keywords", "Read keywords, match types, bids and status from an owned ad group.", group, async a => {
    await own(a, "group"); return call(a, "getkeywordsbyadgroupid", { AdGroupId: a.adGroupId });
  });
  add("get_targeting", "Read configured campaign or ad group targeting for one criterion type, inclusions and exclusions included. This is configuration, not demographic performance.", {
    ...campaign,
    adGroupId: id("Optional ad group ID. Omit it to read campaign-level criteria.").optional(),
    criterionType: z.enum(["Age", "Gender", "DayTime", "Device", "Location", "LocationIntent", "Radius", "RemarketingList", "CustomAudience", "InMarketAudience", "ProductAudience", "Webpage", "ProductPartition"]).describe("Criterion type to read. Call once per type."),
  }, async a => {
    await own(a, a.adGroupId ? "group" : "campaign");
    return a.adGroupId
      ? call(a, "getadgroupcriterionsbyids", { AdGroupId: a.adGroupId, AdGroupCriterionIds: null, CriterionType: a.criterionType })
      : call(a, "getcampaigncriterionsbyids", { CampaignId: a.campaignId, CampaignCriterionIds: null, CriterionType: a.criterionType });
  });
  add("get_audiences", "Read audience configuration for one audience type. An empty audience does not establish that it can be matched or targeted.", {
    ...account,
    type: z.enum(["RemarketingList", "CustomAudience", "InMarketAudience", "ProductAudience", "CombinedList", "CustomerList"]).describe("Audience type to read."),
    audienceIds: ids("Optional audience IDs. Omit to read every audience of this type.").optional(),
  }, async a => {
    await own(a); return call(a, "getaudiencesbyids", { AudienceIds: a.audienceIds ?? null, Type: a.type });
  });
  add("get_uet_tags", "Read UET tracking tag configuration. Nothing is installed on a website.", { ...account, tagIds: ids("Optional UET tag IDs. Omit to read every tag.").optional() }, async a => {
    await own(a); return call(a, "getuettagsbyids", { TagIds: a.tagIds ?? null });
  });
  add("get_conversion_goals", "Read conversion goal configuration. This does not establish that conversions are being recorded.", {
    ...account,
    goalIds: ids("Optional conversion goal IDs. Omit to read every goal of this type.").optional(),
    type: z.enum(["Url", "Event", "Duration", "PagesViewedPerVisit", "OfflineConversion", "AppInstall"]).describe("Conversion goal type to read."),
  }, async a => {
    await own(a); return call(a, "getconversiongoalsbyids", { ConversionGoalIds: a.goalIds ?? null, ConversionGoalTypes: a.type });
  });
  add("get_media", "Read metadata of uploaded media by ID in the selected account, including image representations and their URLs.", { ...account, mediaIds: ids("Media IDs to read, up to 100.") }, async a => {
    await own(a); return call(a, "getmediametadatabyids", { MediaIds: a.mediaIds });
  });
  add("get_videos", "Read account video assets and processing status. Active means the media is ready, not that an ad is delivering.", {
    ...account,
    videoIds: ids("Optional video IDs. Omit to page through every video.").optional(),
    page: z.number().int().min(0).default(0).describe("Zero-based page index."),
    pageSize: z.number().int().min(1).max(100).default(50).describe("Videos per page, 1 to 100."),
  }, async a => {
    await own(a); return call(a, "getvideosbyids", { VideoIds: a.videoIds ?? null, PageInfo: { Index: a.page, Size: a.pageSize } });
  });
  add("get_asset_groups", "Read Performance Max asset groups with their native creative configuration and status.", { ...account, campaignId: id("Numeric Performance Max campaign ID in the selected account.") }, async a => {
    a.campaignType = "PerformanceMax"; await own(a, "campaign"); return call(a, "getassetgroupsbycampaignid", { CampaignId: a.campaignId });
  });
  add("get_geo_file", "Get Microsoft's current geographic targeting file link. Use its Location IDs; never reuse Google location IDs. The link is returned as data and not downloaded.", account, async a => {
    await own(a); return call(a, "getgeolocationsfileurl", { Version: "2.0", LanguageLocale: "en", CompressionType: "GZip" });
  });
  add("list_ad_creatives", "List image assets linked to account-owned ads and Performance Max asset groups, with parent IDs and names. Bounded scan; no inferred delivery, video contents or KPI attribution.", {
    ...account,
    campaignIds: ids("Optional campaign IDs to scan, up to 20.", 20).optional(),
    limit: z.number().int().min(1).max(60).default(24).describe("Maximum image assets to return."),
    maxCampaigns: z.number().int().min(1).max(20).default(10).describe("Maximum campaigns to scan."),
    maxGroups: z.number().int().min(1).max(30).default(15).describe("Maximum ad groups to scan across those campaigns."),
  }, async a => {
    await own(a);
    return bingAdCreatives((op, body) => call(a, op, body), String(a.accountId), { limit: Number(a.limit), maxCampaigns: Number(a.maxCampaigns), maxGroups: Number(a.maxGroups), campaignIds: a.campaignIds as string[] | undefined });
  });
  add("get_reporting_schema", "Read the pinned report types and the native columns each one supports, with official references. A column in this list is not evidence of populated data.", {}, async () => reportColumns);
  add("get_write_schema", "Read the pinned native fields of a Microsoft Advertising entity. Read each polymorphic object's documentation for its REST Type value. Account eligibility is separate.", {
    entity: z.enum(ENTITIES).describe("Entity whose native fields to read."),
  }, async a => ({ checkedAt: schema.checkedAt, ...schema.entities[a.entity as keyof typeof schema.entities] }));
  add("get_setup_guide", "Coverage, safety rules and known limitations of this server. Read it before claiming that a feature is or is not supported.", {}, async () => setupGuide(config));
  add("get_insights", "Submit an asynchronous Microsoft Advertising report for the selected account and return a receipt. Poll the receipt with bing_get_report. Column compatibility and sandbox data availability apply.", {
    ...account,
    reportType: z.enum(REPORT_TYPES).describe("Native report type. Each type supports its own columns; see bing_get_reporting_schema."),
    aggregation: z.enum(["Daily", "Summary"]).default("Daily").describe("Daily returns one row per day. Summary returns period totals; omit TimePeriod from columns to avoid splitting rows."),
    reportTimeZone: z.enum(Object.keys(BING_REPORT_TIMEZONES) as [string, ...string[]]).optional().describe("Native Microsoft reporting time zone. Omit it to keep Microsoft's default."),
    returnOnlyCompleteData: z.boolean().default(false).describe("True makes Microsoft return an error instead of a report while data for the requested period is still being processed."),
    campaignId: id("Optional campaign ID to scope the report. Not supported by account reports.").optional(),
    since: z.string().date().describe("First day of the report, YYYY-MM-DD, inclusive."),
    until: z.string().date().describe("Last day of the report, YYYY-MM-DD, inclusive, on or after since."),
    columns: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,79}$/)).min(1).max(50).describe("Native report columns compatible with reportType; see bing_get_reporting_schema."),
  }, async a => {
    if (String(a.until) < String(a.since)) throw new Error("Microsoft Advertising report date range is reversed.");
    const supported: string[] = reportColumns.reports[a.reportType as keyof typeof reportColumns.reports].columns;
    const unsupported = (a.columns as string[]).filter(column => !supported.includes(column));
    if (unsupported.length) throw new Error(`Microsoft Advertising columns are incompatible with this report type: ${unsupported.slice(0, 10).join(", ")}.`);
    if (a.campaignId && a.reportType === "AccountPerformanceReportRequest") throw new Error("Account reports do not support campaign scope.");
    await own(a);
    const date = (s: unknown) => { const [Year, Month, Day] = String(s).split("-").map(Number); return { Year, Month, Day }; };
    const r = await call(a, "submitgeneratereport", { ReportRequest: {
      Type: a.reportType, ReportName: "bing-ads-mcp", Format: "Csv", FormatVersion: "2.0", Aggregation: a.aggregation,
      ExcludeReportHeader: true, ExcludeReportFooter: true, ReturnOnlyCompleteData: a.returnOnlyCompleteData,
      // Product dimension reports reject AccountId and identify the account by AccountNumber.
      Columns: [...new Set([...(a.reportType === "ProductDimensionPerformanceReportRequest" ? ["AccountNumber"] : ["AccountId"]), ...(a.columns as string[])])],
      Scope: a.campaignId ? { Campaigns: [{ AccountId: a.accountId, CampaignId: a.campaignId }] } : { AccountIds: [a.accountId] },
      Time: { ...(a.reportTimeZone ? { ReportTimeZone: a.reportTimeZone } : {}), CustomDateRangeStart: date(a.since), CustomDateRangeEnd: date(a.until) },
    } });
    if (typeof r.ReportRequestId !== "string" || !r.ReportRequestId) throw new Error("Microsoft Advertising report request ID missing.");
    return { status: "Submitted", receipt: reportReceipt(config, String(a.accountId), r.ReportRequestId), next: "bing_get_report", dataValidation: "Report acceptance does not establish that rows or metrics are populated." };
  });
  add("get_report", "Poll and download a report submitted by bing_get_insights for the same account. Returns up to 2,000 CSV rows as strings; narrow the range when truncated is true. Empty sandbox output is not production evidence.", {
    ...account, receipt: z.string().max(3000).describe("Receipt returned by bing_get_insights in this server session. It expires after one hour."),
  }, async a => {
    const job = verifyReportReceipt(String(a.receipt), config, String(a.accountId));
    await own(a); return pollBingReport(api, job, scope(a));
  });

  collector.resource?.("Microsoft Advertising guide", "bing-ads://guide", async () => ({
    contents: [{ uri: "bing-ads://guide", mimeType: "application/json", text: JSON.stringify(setupGuide(config), null, 2) }],
  }));
}

function payload(raw: unknown, a: BingRow, create: boolean, paused: boolean): BingRow {
  const data = { ...(raw as BingRow) };
  for (const field of ["AccountId", "ParentId"]) if (data[field] != null && String(data[field]) !== a.accountId) throw new Error("Microsoft Advertising payload account mismatch.");
  if (create && data.Id != null) throw new Error("New Microsoft Advertising entities must not specify an Id.");
  if (data.CustomerShare != null || data.CustomerId != null) throw new Error("Cross-customer sharing is not exposed by this server.");
  if (paused) {
    if (data.Status != null && !["Paused", ...(create ? [] : ["Active"])].includes(String(data.Status))) throw new Error("Create advertising entities Paused; updates allow only Paused or Active.");
    if (create) data.Status = "Paused";
  }
  return data;
}

function preview(config: BingConfig, operation: string, body: BingRow, data?: BingRow) {
  return {
    applied: false, preview: true, environment: config.environment, operation, body, providerValidation: false,
    ownership: "Checked against Microsoft on the confirmed call.",
    activationMaySpend: data?.Status === "Active",
    message: PREVIEW_MESSAGE,
  };
}

export function registerBingWrites(collector: Collector, config: BingConfig, api: BingClient) {
  const { scope, call, own, list, add } = setup(collector, config, api);
  const specs = [
    ["campaign", "addcampaigns", "updatecampaigns", "Campaigns", account, "account"],
    ["ad_group", "addadgroups", "updateadgroups", "AdGroups", campaign, "campaign"],
    ["ad", "addads", "updateads", "Ads", group, "group"],
    ["keyword", "addkeywords", "updatekeywords", "Keywords", group, "group"],
    ["audience", "addaudiences", "updateaudiences", "Audiences", account, "account"],
  ] as const;
  const label = (kind: string) => kind.replace("_", " ");
  for (const [kind, createOp, updateOp, field, shape, level] of specs) for (const create of [true, false]) {
    const updateShape: Shape = create ? {} : { id: id(`Numeric ID of the ${label(kind)} to update.`), ...(kind === "campaign" ? { campaignType: campaignType.describe("Native type of the campaign being updated, used to verify ownership.") } : {}) };
    const created = kind === "audience" ? "" : kind === "campaign" ? " Campaigns are created Paused." : ` ${label(kind)[0]!.toUpperCase()}${label(kind).slice(1)}s are created Paused.`;
    add(`${create ? "create" : "update"}_${kind}`, `${create ? "Create" : "Update"} a Microsoft Advertising ${label(kind)} with native fields. Preview by default.${create ? created : " Setting Status to Active can start spending."} Read bing_get_write_schema and the current configuration first.`, { ...shape, ...updateShape, data: native, confirm }, async a => {
      scope(a);
      const data = payload(a.data, a, create, kind !== "audience");
      if (!create) { if (data.Id != null && String(data.Id) !== a.id) throw new Error("Microsoft Advertising update ID mismatch."); data.Id = a.id; }
      if (kind === "campaign" && create) campaignType.parse(data.CampaignType);
      if (kind === "audience") {
        if (data.Scope && data.Scope !== "Account") throw new Error("Audience sharing across accounts is not exposed.");
        if (create) { data.Scope = "Account"; data.ParentId = a.accountId; }
      }
      const body: BingRow = { [field]: [data], ...(kind === "campaign" ? { AccountId: a.accountId } : kind === "ad_group" ? { CampaignId: a.campaignId } : kind === "ad" || kind === "keyword" ? { AdGroupId: a.adGroupId } : {}) };
      const operation = create ? createOp : updateOp;
      if (!a.confirm) return preview(config, operation, body, data);
      await own(a, level);
      if (!create) {
        let current: BingRow[];
        if (kind === "campaign") { await own({ ...a, campaignId: a.id }, "campaign"); current = [{ Id: a.id }]; }
        else if (kind === "ad_group") current = list(await call(a, "getadgroupsbycampaignid", { CampaignId: a.campaignId }), "AdGroups");
        else if (kind === "ad") {
          if (typeof data.Type !== "string") throw new Error("Microsoft Advertising ad Type is required for an update.");
          current = list(await call(a, "getadsbyadgroupid", { AdGroupId: a.adGroupId, AdTypes: [data.Type] }), "Ads");
        } else if (kind === "keyword") current = list(await call(a, "getkeywordsbyadgroupid", { AdGroupId: a.adGroupId }), "Keywords");
        else {
          if (typeof data.Type !== "string") throw new Error("Microsoft Advertising audience Type is required for an update.");
          current = list(await call(a, "getaudiencesbyids", { AudienceIds: [a.id], Type: data.Type }), "Audiences");
        }
        if (!current.some(r => String(r.Id) === a.id)) throw new Error("Microsoft Advertising entity is not in the selected parent.");
        if (kind === "audience" && current.some(r => String(r.Id) === a.id && (r.Scope !== "Account" || String(r.ParentId) !== a.accountId))) {
          throw new Error("Updating shared audiences is not exposed; select an account-owned audience.");
        }
      }
      return applied(operation, await call(a, operation, body));
    });
  }

  // Campaigns and ad groups accept a partial update, so a rename sends Name
  // alone. Ads have no name. Accounts only accept a full update.
  const name = (max: number, min = 1) => z.string().trim().min(min).max(max).describe(`${D.name} ${min} to ${max} characters, unique among its siblings.`);
  add("rename_campaign", "Rename a Microsoft Advertising campaign. The name is the only thing that changes. Preview by default.", { ...campaign, name: name(128), confirm }, async a => {
    scope(a);
    if (!a.confirm) return renamePreview("bing_rename_campaign", String(a.campaignId), String(a.name), { environment: config.environment });
    await own(a, "campaign");
    return applied("updatecampaigns", await call(a, "updatecampaigns", { AccountId: a.accountId, Campaigns: [{ Id: a.campaignId, Name: a.name }] }));
  });
  add("rename_ad_group", "Rename a Microsoft Advertising ad group. The name is the only thing that changes. Preview by default.", { ...group, name: name(256), confirm }, async a => {
    scope(a);
    if (!a.confirm) return renamePreview("bing_rename_ad_group", String(a.adGroupId), String(a.name), { environment: config.environment });
    await own(a, "group");
    return applied("updateadgroups", await call(a, "updateadgroups", { CampaignId: a.campaignId, AdGroups: [{ Id: a.adGroupId, Name: a.name }] }));
  });
  add("rename_account", "Rename the selected Microsoft Advertising account. Microsoft only accepts a full account update, so the account is read and written back unchanged except for its name. Preview by default.", { ...account, name: name(100, 3), confirm }, async a => {
    scope(a);
    if (!a.confirm) return renamePreview("bing_rename_account", String(a.accountId), String(a.name), { environment: config.environment });
    // The read carries LastModifiedTime, which Microsoft uses to refuse a stale overwrite.
    const current = await own(a);
    return applied("updateaccount", await call(a, "updateaccount", { Account: { ...current, Name: a.name } }));
  });
  add("import_video", "Import a video from your directly downloadable public HTTPS file into the selected account. Microsoft fetches and transcodes it asynchronously; a returned ID does not mean it is ready. Poll bing_get_videos. Does not create or activate an ad. Preview by default.", {
    ...account,
    sourceUrl: z.string().url().refine(isPublicHttpsUrl, "Use a public HTTPS video URL without credentials or a custom port.").describe("Public, directly downloadable HTTPS video file that you own. Microsoft fetches it; this server does not."),
    description: z.string().min(1).max(500).describe("Description that identifies this video asset in the account."),
    confirm,
  }, async a => {
    scope(a); const body = { Videos: [{ SourceUrl: a.sourceUrl, Description: a.description }] };
    if (!a.confirm) return preview(config, "addvideos", body);
    await own(a); return applied("addvideos", await call(a, "addvideos", body));
  });
  add("update_video", "Update the description of an account-owned video asset. Does not change delivery or replace the video source. Preview by default; read back with bing_get_videos.", {
    ...account, videoId: id("Numeric ID of a video in the selected account."), description: z.string().min(1).max(500).describe("Replacement description for the video."), confirm,
  }, async a => {
    scope(a); const body = { Videos: [{ Id: a.videoId, Description: a.description }] };
    if (!a.confirm) return preview(config, "updatevideos", body);
    await own(a);
    const current = list(await call(a, "getvideosbyids", { VideoIds: [a.videoId] }), "Videos");
    if (!current.some(v => String(v.Id) === a.videoId)) throw new Error("Microsoft Advertising video is not in the selected account.");
    return applied("updatevideos", await call(a, "updatevideos", body));
  });
  add("upload_image", "Upload image bytes to the selected account's media library. Does not create or activate an ad. The preview reports the encoded length without repeating the image.", {
    ...account,
    base64: z.string().min(8).max(6_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/).describe("Base64 image bytes without a data URL prefix, up to 6 million encoded characters."),
    confirm,
  }, async a => {
    scope(a);
    if (!a.confirm) return { ...preview(config, "addmedia", {}), body: undefined, encodedLength: String(a.base64).length };
    await own(a); return applied("addmedia", await call(a, "addmedia", { AccountId: a.accountId, Media: [{ Type: "Image", MediaType: "GenericImage", Data: a.base64 }] }));
  });
  add("create_asset_group", "Create a Paused Performance Max asset group with text and image assets. Requires an eligible campaign and every required asset. A local preview is not provider validation.", {
    ...account, campaignId: id("Numeric Performance Max campaign ID in the selected account."), data: native, confirm,
  }, async a => {
    scope(a); const data = payload(a.data, a, true, true); const body = { CampaignId: a.campaignId, AssetGroups: [data] };
    if (!a.confirm) return preview(config, "addassetgroups", body, data);
    await own({ ...a, campaignType: "PerformanceMax" }, "campaign"); return applied("addassetgroups", await call(a, "addassetgroups", body));
  });
  for (const [kind, operation, field, text] of [
    ["uet_tag", "adduettags", "UetTags", "Create a UET tag configuration. Nothing is installed on a website. Preview by default."],
    ["conversion_goal", "addconversiongoals", "ConversionGoals", "Create a conversion goal configuration. It is created Paused, scoped to the account and excluded from bidding. No event is sent. Preview by default."],
  ] as const) add(`create_${kind}`, text, { ...account, data: native, confirm }, async a => {
    scope(a); const data = payload(a.data, a, true, false);
    if (kind === "conversion_goal") { data.Scope = "Account"; data.Status = "Paused"; data.ExcludeFromBidding = true; }
    const body = { [field]: [data] };
    if (!a.confirm) return preview(config, operation, body, data);
    await own(a); return applied(operation, await call(a, operation, body));
  });
  for (const isGroup of [false, true]) for (const update of [false, true]) {
    const level = isGroup ? "ad group" : "campaign";
    add(`${update ? "update" : "add"}_${isGroup ? "ad_group" : "campaign"}_targeting`, `${update ? "Update" : "Add"} one native ${level} targeting criterion. Read current targeting first. Use Targets for demographic, location and device criteria and Audience for audience associations. Criteria that are not sent are left unchanged. Preview by default.`, {
      ...(isGroup ? group : campaign),
      criterionType: z.enum(["Targets", "Audience", "Webpage", "ProductPartition"]).describe("Write category: Targets for demographics, location and devices; Audience for audience associations. Reads use the specific criterion type."),
      data: native, confirm,
    }, async a => {
      scope(a); const data = payload(a.data, a, !update, false);
      const parent = isGroup ? "AdGroupId" : "CampaignId"; const parentId = isGroup ? a.adGroupId : a.campaignId;
      if (data[parent] != null && String(data[parent]) !== parentId) throw new Error("Microsoft Advertising criterion parent mismatch.");
      data[parent] = parentId;
      if (update) bingId(data.Id);
      const op = `${update ? "update" : "add"}${isGroup ? "adgroup" : "campaign"}criterions` as BingOperation;
      const body = { CriterionType: a.criterionType, [isGroup ? "AdGroupCriterions" : "CampaignCriterions"]: [data] };
      if (!a.confirm) return preview(config, op, body, data);
      await own(a, isGroup ? "group" : "campaign"); return applied(op, await call(a, op, body));
    });
  }
}
