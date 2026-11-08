import { describe, expect, it, vi } from "vitest";
import type { BingRow } from "../../src/client.js";
import { bingAdCreatives } from "../../src/creatives.js";
import type { BingOperation } from "../../src/operations.js";

function fixture() {
  return vi.fn(async (op: BingOperation, body: BingRow): Promise<BingRow> => {
    if (op === "getcampaignsbyaccountid") return { Campaigns: body.CampaignType === "Audience" ? [{ Id: "10" }] : body.CampaignType === "PerformanceMax" ? [{ Id: "11" }] : [] };
    if (op === "getadgroupsbycampaignid") return { AdGroups: [{ Id: "20" }] };
    if (op === "getadsbyadgroupid") return { Ads: [{ Id: "30", Name: "Image ad", Images: [{ Asset: { Id: "40" } }], FinalUrls: ["https://www.example.com/landing"] }, { Id: "31", Type: "ResponsiveSearch" }] };
    if (op === "getassetgroupsbycampaignid") return { AssetGroups: [{ Id: "50", Name: "PMax assets", Images: [{ Asset: { Id: "40" } }] }] };
    if (op === "getmediametadatabyids") return { MediaMetaData: [{ Id: "40", Representations: [{ Url: "http://media.example/plain.png", Width: 2000, Height: 2000 }, { Url: "https://media.example/image.png", Width: 1200, Height: 628 }] }] };
    throw new Error(op);
  });
}

describe("Microsoft creative inventory", () => {
  it("joins image metadata to every ad and asset group reference without inventing a text-ad image", async () => {
    const call = fixture();
    const r = await bingAdCreatives(call, "1", { limit: 24, maxCampaigns: 10, maxGroups: 15 });
    expect(r.assets).toHaveLength(1);
    expect(r.assets[0]).toMatchObject({ nativeAssetId: "40", relatedAds: [{ id: "30", name: "Image ad" }], relatedAssetGroups: [{ id: "50", name: "PMax assets" }], width: 1200, assetUrl: "https://media.example/image.png", landingPageUrl: "https://www.example.com/landing" });
    expect(r.coverage).toMatchObject({ textOnlyAds: 1, partial: false });
    expect(call.mock.calls.filter(([op]) => op === "getmediametadatabyids")[0]?.[1]).toEqual({ MediaIds: ["40"] });
  });
  it("refuses a requested foreign campaign before group, ad or media reads", async () => {
    const call = fixture();
    await expect(bingAdCreatives(call, "1", { limit: 24, maxCampaigns: 10, maxGroups: 15, campaignIds: ["999"] })).rejects.toThrow(/not in the selected account/);
    expect(call.mock.calls.every(([op]) => op === "getcampaignsbyaccountid")).toBe(true);
  });
  it("refuses a missing ad inventory rather than reporting an empty account", async () => {
    const base = fixture();
    const call = async (op: BingOperation, body: BingRow) => op === "getadsbyadgroupid" ? {} : base(op, body);
    await expect(bingAdCreatives(call, "1", { limit: 24, maxCampaigns: 10, maxGroups: 15 })).rejects.toThrow(/ad inventory is incomplete/);
  });
  it("marks capped inventory as partial rather than claiming a full account", async () => {
    const r = await bingAdCreatives(fixture(), "1", { limit: 24, maxCampaigns: 1, maxGroups: 15 });
    expect(r.coverage.partial).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
