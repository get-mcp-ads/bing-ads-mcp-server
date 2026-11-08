/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { bingId, type BingRow } from "./client.js";
import type { BingOperation } from "./operations.js";
import { httpsMediaUrl } from "./safety.js";

type Reference = { id: string; name: string | null };
type Creative = {
  id: string; nativeAssetId: string; kind: "image"; name: string; nameSource: "ad" | "asset_group"; assetName?: string;
  relatedAds: Reference[]; relatedAssetGroups: Reference[]; assetUrl: string; landingPageUrl?: string; width?: number; height?: number;
};
type Call = (operation: BingOperation, body: BingRow) => Promise<BingRow>;

const rows = (v: unknown): BingRow[] => Array.isArray(v) ? v.filter((x): x is BingRow => Boolean(x) && typeof x === "object") : [];
const object = (v: unknown): BingRow => v && typeof v === "object" && !Array.isArray(v) ? v as BingRow : {};
function requiredRows(v: unknown, label: string): BingRow[] {
  if (!Array.isArray(v)) throw new Error(`Microsoft Advertising ${label} inventory is incomplete.`);
  return rows(v);
}

/**
 * Walks account-owned campaigns, ad groups, ads and Performance Max asset
 * groups, then reads image metadata. The scan is bounded and says so when it
 * stops early. Media URLs are returned as data and never fetched here. Text ads
 * are not given a substitute image.
 */
export async function bingAdCreatives(call: Call, accountId: string, options: { limit: number; maxCampaigns: number; maxGroups: number; campaignIds?: string[] }) {
  const campaigns: BingRow[] = [], warnings: string[] = [];
  for (const type of ["Search", "Audience", "PerformanceMax", "Shopping", "Hotel"]) {
    const r = await call("getcampaignsbyaccountid", { AccountId: accountId, CampaignType: type });
    if (!Array.isArray(r.Campaigns)) throw new Error("Microsoft Advertising campaign inventory is incomplete.");
    campaigns.push(...rows(r.Campaigns).map(c => ({ ...c, campaignType: type })));
  }
  if (options.campaignIds?.some(id => !campaigns.some(c => String(c.Id) === id))) throw new Error("Microsoft Advertising requested campaign is not in the selected account.");
  const matching = campaigns.filter(c => !options.campaignIds || options.campaignIds.includes(String(c.Id)));
  const selected = matching.slice(0, options.maxCampaigns);
  let groups = 0, ads = 0, partial = matching.length > selected.length, textOnly = 0;
  const refs = new Map<string, { ads: Reference[]; groups: Reference[]; name?: string; landing?: string }>();
  const add = (row: BingRow, group: boolean) => {
    const assets = rows(row.Images);
    if (!assets.length) { if (!group && !rows(row.Videos).length) textOnly++; return; }
    for (const link of assets) {
      const asset = object(link.Asset);
      if (!asset.Id) continue;
      const id = bingId(asset.Id);
      const r = refs.get(id) ?? { ads: [], groups: [] };
      const reference = { id: bingId(row.Id), name: typeof row.Name === "string" ? row.Name : null };
      (group ? r.groups : r.ads).push(reference);
      if (typeof asset.Name === "string") r.name = asset.Name;
      const url = Array.isArray(row.FinalUrls) ? row.FinalUrls[0] : null;
      r.landing ??= httpsMediaUrl(url);
      refs.set(id, r);
    }
  };
  for (const campaign of selected) {
    if (campaign.campaignType === "PerformanceMax") {
      const r = await call("getassetgroupsbycampaignid", { CampaignId: bingId(campaign.Id) });
      for (const group of requiredRows(r.AssetGroups, "asset group")) add(group, true);
      continue;
    }
    const found = requiredRows((await call("getadgroupsbycampaignid", { CampaignId: bingId(campaign.Id) })).AdGroups, "ad group");
    const selectedGroups = found.slice(0, Math.max(0, options.maxGroups - groups));
    if (selectedGroups.length < found.length) partial = true;
    for (const group of selectedGroups) {
      groups++;
      const foundAds = requiredRows((await call("getadsbyadgroupid", { AdGroupId: bingId(group.Id), AdTypes: ["ResponsiveAd", "ResponsiveSearch", "DynamicSearch", "Product", "AppInstall"] })).Ads, "ad");
      const selectedAds = foundAds.slice(0, 200);
      if (foundAds.length > selectedAds.length) partial = true;
      ads += selectedAds.length;
      for (const ad of selectedAds) add(ad, false);
    }
  }
  const ids = [...refs.keys()].slice(0, Math.min(100, options.limit));
  partial ||= refs.size > ids.length;
  const assets: Creative[] = [];
  if (ids.length) {
    const result = await call("getmediametadatabyids", { MediaIds: ids });
    if (rows(result.PartialErrors).length) { partial = true; warnings.push("Some image metadata requests returned partial errors."); }
    for (const m of rows(result.MediaMetaData)) {
      const id = bingId(m.Id), r = refs.get(id);
      if (!r) continue;
      const images = rows(m.Representations).filter(v => httpsMediaUrl(v.Url)).sort((a, b) => Number(b.Width) * Number(b.Height) - Number(a.Width) * Number(a.Height));
      const image = images[0];
      if (!image) { partial = true; warnings.push(`No usable HTTPS representation for image ${id}.`); continue; }
      const dedupe = (v: Reference[]) => [...new Map(v.map(x => [x.id, x])).values()];
      const relatedAds = dedupe(r.ads), relatedAssetGroups = dedupe(r.groups);
      const labels = [...relatedAds.map(a => a.name ?? `Ad ${a.id}`), ...relatedAssetGroups.map(g => g.name ?? `Asset group ${g.id}`)];
      assets.push({
        id, nativeAssetId: id, kind: "image", name: labels.join(" / "), nameSource: relatedAds.length ? "ad" : "asset_group", assetName: r.name,
        relatedAds, relatedAssetGroups, assetUrl: httpsMediaUrl(image.Url)!, landingPageUrl: r.landing,
        width: Number(image.Width) || undefined, height: Number(image.Height) || undefined,
      });
    }
    if (assets.length < ids.length) partial = true;
  }
  if (partial) warnings.push("Bounded or incomplete inventory. Narrow campaignIds or read campaigns, ad groups and media directly for the remainder.");
  return {
    assets, count: assets.length, warnings,
    coverage: { scope: "Account-owned ad and Performance Max image assets; no delivery filter or KPI attribution", campaigns: selected.length, groups, ads, textOnlyAds: textOnly, matchedImages: refs.size, partial },
    limitations: [
      "Text-only ads are not image assets. Videos and catalog-generated product imagery are not replaced with landing-page screenshots.",
      "An image shared by ads and asset groups keeps every observed parent reference; inventory membership does not prove delivery.",
    ],
  };
}
