/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * REST v13 operations used by the tools, checked against the Microsoft
 * Advertising API reference on 2026-09-11. This is a closed list: the client
 * refuses any operation that is not declared here.
 */
type Service = "campaign" | "customer" | "reporting";
type Spec = { service: Service; path: string; method: "POST" | "PUT"; write: boolean; reference: string };

const cm = (path: string, method: "POST" | "PUT", write: boolean, name: string): Spec =>
  ({ service: "campaign", path: `/CampaignManagement/v13/${path}`, method, write, reference: `campaign-management-service/${name}` });
const customer = (path: string, method: "POST" | "PUT", write: boolean, name: string): Spec =>
  ({ service: "customer", path: `/CustomerManagement/v13/${path}`, method, write, reference: `customer-management-service/${name}` });
const reporting = (path: string, name: string): Spec =>
  ({ service: "reporting", path: `/Reporting/v13/${path}`, method: "POST", write: false, reference: `reporting-service/${name}` });

export const DOCUMENTATION_BASE = "https://learn.microsoft.com/en-us/advertising/";

export const BING_OPERATIONS = {
  getuser: customer("User/Query", "POST", false, "getuser"),
  searchaccounts: customer("Accounts/Search", "POST", false, "searchaccounts"),
  getaccount: customer("Account/Query", "POST", false, "getaccount"),
  updateaccount: customer("Account", "PUT", true, "updateaccount"),

  getcampaignsbyaccountid: cm("Campaigns/QueryByAccountId", "POST", false, "getcampaignsbyaccountid"),
  getcampaignsbyids: cm("Campaigns/QueryByIds", "POST", false, "getcampaignsbyids"),
  getadgroupsbycampaignid: cm("AdGroups/QueryByCampaignId", "POST", false, "getadgroupsbycampaignid"),
  getadgroupsbyids: cm("AdGroups/QueryByIds", "POST", false, "getadgroupsbyids"),
  getadsbyadgroupid: cm("Ads/QueryByAdGroupId", "POST", false, "getadsbyadgroupid"),
  getkeywordsbyadgroupid: cm("Keywords/QueryByAdGroupId", "POST", false, "getkeywordsbyadgroupid"),
  getaudiencesbyids: cm("Audiences/QueryByIds", "POST", false, "getaudiencesbyids"),
  getadgroupcriterionsbyids: cm("AdGroupCriterions/QueryByIds", "POST", false, "getadgroupcriterionsbyids"),
  getcampaigncriterionsbyids: cm("CampaignCriterions/QueryByIds", "POST", false, "getcampaigncriterionsbyids"),
  getconversiongoalsbyids: cm("ConversionGoals/QueryByIds", "POST", false, "getconversiongoalsbyids"),
  getuettagsbyids: cm("UetTags/QueryByIds", "POST", false, "getuettagsbyids"),
  getmediametadatabyids: cm("MediaMetaData/QueryByIds", "POST", false, "getmediametadatabyids"),
  getassetgroupsbycampaignid: cm("AssetGroups/QueryByCampaignId", "POST", false, "getassetgroupsbycampaignid"),
  getgeolocationsfileurl: cm("GeoLocationsFileUrl/Query", "POST", false, "getgeolocationsfileurl"),
  getvideosbyids: cm("Videos/QueryByIds", "POST", false, "getvideosbyids"),

  addcampaigns: cm("Campaigns", "POST", true, "addcampaigns"),
  updatecampaigns: cm("Campaigns", "PUT", true, "updatecampaigns"),
  addadgroups: cm("AdGroups", "POST", true, "addadgroups"),
  updateadgroups: cm("AdGroups", "PUT", true, "updateadgroups"),
  addads: cm("Ads", "POST", true, "addads"),
  updateads: cm("Ads", "PUT", true, "updateads"),
  addkeywords: cm("Keywords", "POST", true, "addkeywords"),
  updatekeywords: cm("Keywords", "PUT", true, "updatekeywords"),
  addaudiences: cm("Audiences", "POST", true, "addaudiences"),
  updateaudiences: cm("Audiences", "PUT", true, "updateaudiences"),
  addmedia: cm("Media", "POST", true, "addmedia"),
  addcampaigncriterions: cm("CampaignCriterions", "POST", true, "addcampaigncriterions"),
  updatecampaigncriterions: cm("CampaignCriterions", "PUT", true, "updatecampaigncriterions"),
  addadgroupcriterions: cm("AdGroupCriterions", "POST", true, "addadgroupcriterions"),
  updateadgroupcriterions: cm("AdGroupCriterions", "PUT", true, "updateadgroupcriterions"),
  addassetgroups: cm("AssetGroups", "POST", true, "addassetgroups"),
  adduettags: cm("UetTags", "POST", true, "adduettags"),
  addconversiongoals: cm("ConversionGoals", "POST", true, "addconversiongoals"),
  addvideos: cm("Videos", "POST", true, "addvideos"),
  updatevideos: cm("Videos", "PUT", true, "updatevideos"),

  submitgeneratereport: reporting("GenerateReport/Submit", "submitgeneratereport"),
  pollgeneratereport: reporting("GenerateReport/Poll", "pollgeneratereport"),
} as const satisfies Record<string, Spec>;

export type BingOperation = keyof typeof BING_OPERATIONS;
