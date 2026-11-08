/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Descriptions shared by parameters that mean the same thing in every tool.
 * A description written on the schema itself always wins.
 */
export const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  accountId: "Account ID listed in BING_ADS_ACCOUNT_IDS. Use the numeric ID, not the eight-character account number shown in the web app.",
  campaignId: "Numeric campaign ID in the selected account.",
  campaignType: "Native type of campaignId, used to verify that it belongs to the account. Dynamic Search campaigns use Search with DynamicSearchAdsSetting.",
  adGroupId: "Numeric ad group ID in the selected campaign.",
  id: "Numeric ID of the entity to update. It must belong to the selected parent.",
  data: "Native Microsoft Advertising REST fields for this entity. Read bing_get_write_schema first. REST Type values can differ from SOAP class names. Microsoft checks eligibility only on a confirmed call.",
  confirm: "False returns a local preview and sends nothing. True applies this exact change, after the user approved it.",
  name: "New name. This is the only field the call changes.",
};
