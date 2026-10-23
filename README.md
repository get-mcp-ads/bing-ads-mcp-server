<div align="center">

# Microsoft Advertising MCP server

### Bring your Microsoft Advertising accounts into your MCP client.

Read campaigns, targeting and reports through the Bing Ads API, and prepare changes for explicitly selected accounts.

[![Release](https://img.shields.io/github/v/release/get-mcp-ads/bing-ads-mcp-server?color=2448e5)](https://github.com/get-mcp-ads/bing-ads-mcp-server/releases/latest)
[![CI](https://github.com/get-mcp-ads/bing-ads-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/get-mcp-ads/bing-ads-mcp-server/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.23.4%20%7C%2024.22.1%20%7C%2026.12.1-brightgreen.svg)](package.json)

[Watch the film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4) · [What's new](#whats-new) · [Install](#install-this-release) · [Tool reference](#tools) · [Try hosted getmcpads](https://www.getmcpads.com/tools/bing-ads?utm_source=github&utm_medium=readme&utm_campaign=bing-ads)

[![Watch the getmcpads film: every ad account in one conversation with your AI assistant](https://www.getmcpads.com/home/film/brand-film-poster-promise.webp)](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)

**[Play the 45-second film](https://www.getmcpads.com/home/film/get-mcp-ads-brand-film-1080p.mp4)**

</div>

The film shows hosted getmcpads with sample data. Its MCP Apps, from creative galleries and alerts to Google Sheets exports and bulk launches, belong to the hosted product. This repository provides the standalone native API tools.

**20 read tools** · **23 write tools**, disabled by default.

Run locally with your own Microsoft Advertising credentials and a client that supports stdio MCP, such as Claude Desktop, Claude Code or Cursor. Your requests go directly to the Bing Ads API. For managed connections, including supported ChatGPT setups, use the hosted option.

## What's new

**[v1.0.0: First standalone release](https://github.com/get-mcp-ads/bing-ads-mcp-server/releases/tag/v1.0.0) · October 23, 2026**

- Port the native Microsoft Advertising tools of the getmcpads gateway, with their ownership checks and paused creation.
- Add `bing_list_accounts` for account discovery limited to the configured accounts.
- Read credentials from `BING_ADS_*` variables and renew access tokens in memory only.
- Default to read-only, preview every write and never retry an uncertain write.
- Use fixed Microsoft hosts, no redirects, timeouts, bounded responses and credential redaction.

[Full changelog](CHANGELOG.md) · [Source synchronization details](SOURCE_SYNC.md) · [All releases](https://github.com/get-mcp-ads/bing-ads-mcp-server/releases)

### Upgrade notes

Requires **Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release of those lines**. These releases carry the October 2026 security fixes; the server prints a warning on stderr when started on an older one. CI covers Node 22, 24 and 26. Writes remain optional and require explicit confirmation. Hosted creative integrations and MCP Apps UI are outside this release.

## Install this release

This is a GitHub source release. npm and MCP Registry versions are published separately. The commands below select this exact version; unpinned `npx` examples later in this document select the version currently available on npm.

```bash
git clone --branch v1.0.0 --depth 1 https://github.com/get-mcp-ads/bing-ads-mcp-server.git
cd bing-ads-mcp-server
npm ci
npm run build
```

Configure your MCP client to run `node` with the absolute path to `dist/cli.js` and the credentials documented below. Once the package is on npm, the client can run it with `npx`:

```json
{
  "mcpServers": {
    "microsoft-advertising": {
      "command": "npx",
      "args": ["-y", "@getmcpads/bing-ads-mcp-server"],
      "env": {
        "BING_ADS_DEVELOPER_TOKEN": "your-developer-token",
        "BING_ADS_CLIENT_ID": "your-app-client-id",
        "BING_ADS_REFRESH_TOKEN": "your-refresh-token",
        "BING_ADS_CUSTOMER_ID": "1234567",
        "BING_ADS_ACCOUNT_IDS": "7654321"
      }
    }
  }
}
```

`npm run doctor` reports which variables are set, without printing their values, and checks the Node.js release.

> **Managed connection:** [use Microsoft Advertising with hosted getmcpads](https://www.getmcpads.com/tools/bing-ads?utm_source=github&utm_medium=readme&utm_campaign=bing-ads). Connect your account, select the data your assistant may access and use the hosted MCP connection. See the site for current features and plans.

## Configuration

Provide these environment variables through the client's secret configuration:

| Variable | Purpose |
|---|---|
| `BING_ADS_DEVELOPER_TOKEN` | Your developer token. Required in production. The sandbox always uses Microsoft's universal sandbox token. |
| `BING_ADS_CLIENT_ID` | Application (client) ID of your Microsoft Entra app registration, or of your Google OAuth client. |
| `BING_ADS_CLIENT_SECRET` | Client secret. Only for a web app registration, or for Google identity. Leave it unset for a public app. |
| `BING_ADS_REFRESH_TOKEN` | Refresh token granted with the `https://ads.microsoft.com/msads.manage` and `offline_access` scopes. |
| `BING_ADS_CUSTOMER_ID` | Customer ID that owns the accounts (`cid` in the web app URL). Required unless every account entry carries its own. |
| `BING_ADS_ACCOUNT_IDS` | Required allowlist of account IDs (`aid` in the web app URL), comma-separated. Write `accountId:customerId` for an account owned by another customer. Up to 200. |
| `BING_ADS_ENVIRONMENT` | `production` (default) or `sandbox`. Each environment needs its own credentials. |
| `BING_ADS_IDENTITY_PROVIDER` | `Microsoft` (default) or `Google`, for users who sign in to Microsoft Advertising with a Google account. |
| `BING_ADS_OAUTH_TENANT` | Microsoft Entra tenant of the token endpoint. Defaults to `common`. |
| `BING_ADS_ENABLE_WRITES` | Defaults to `false`. Only the exact value `true` exposes write tools. |

Microsoft documents each step: [get a developer token](https://learn.microsoft.com/en-us/advertising/guides/get-started?view=bingads-13#get-a-developer-token), [register an application](https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth-register?view=bingads-13), [request user consent](https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth-consent?view=bingads-13) and [get access and refresh tokens](https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth-get-tokens?view=bingads-13), including the Google identity variant. Use the numeric account ID, not the eight-character account number shown in the web app.

This package accepts a refresh token; it does not run an OAuth browser flow. It renews access tokens a minute before they expire and keeps them, and any rotated refresh token, in memory only. Microsoft can invalidate a refresh token at any time, for example after a password change. A refresh token issued to a public app is only guaranteed to refresh on the device that obtained it. When a refresh fails, obtain a new token and restart the server.

## Safety and coverage

Writes preview by default. Review the exact account, target and parameters before repeating the call with `confirm: true`.
Campaigns, ad groups, ads, keywords and asset groups are created Paused. Conversion goals are created Paused and excluded from bidding. Setting `Status` to `Active` can start spending, and previews flag it with `activationMaySpend`.
Do not retry a write automatically when its result is uncertain. Read the account and reconcile it first. A confirmed call that returns `applied: "partial"` applied some items and refused others.
Only accounts in `BING_ADS_ACCOUNT_IDS` are reachable. Account discovery returns only those accounts. Before data is returned or changed, the server reads the account and stops unless Microsoft reports the configured customer as its owner. Unknown arguments are rejected.
Native REST fields, report columns and units are preserved. Report values stay strings as Microsoft wrote them, in account currency units. 64-bit IDs stay exact.
Reports are asynchronous: `bing_get_insights` returns a receipt that `bing_get_report` polls. A receipt is valid for one hour in the server process that issued it. A report returns at most 2,000 rows.
Microsoft applies per-user and per-account call limits. Error 117 means the call rate was exceeded; wait for the window to reset.

This server exposes a reviewed subset of the Campaign Management, Customer Management and Reporting services. It does not include billing, bulk upload or Ad Insight operations, account sharing across customers, or change history.
Native media reads and writes are included. Hosted creative galleries, visual editors and MCP Apps UI are excluded.
Use `tools/list` or [server-card.json](server-card.json) for exact schemas and [the Microsoft Advertising API reference](https://learn.microsoft.com/en-us/advertising/guides/?view=bingads-13) for provider details.

## Microsoft's own MCP server

Microsoft publishes a Microsoft Advertising MCP server, documented on Microsoft Learn: [setup guide](https://learn.microsoft.com/en-us/advertising/guides/mcp-setup?view=bingads-13), [tools](https://learn.microsoft.com/en-us/advertising/guides/mcp-tools?view=bingads-13) and [use cases](https://learn.microsoft.com/en-us/advertising/guides/mcp-use-cases?view=bingads-13). In June 2026, Microsoft [announced](https://about.ads.microsoft.com/en/blog/post/june-2026/building-a-new-ai-economy-that-creates-value-for-everyone) that the server was expanding to an open pilot with read-only access.

The differences below come from those pages, as of October 23, 2026.

| | Microsoft's MCP server | This server |
|---|---|---|
| Where it runs | Remote endpoint at `https://partner.api.bingads.microsoft.com/ext/mcp/vnext` | Locally, over stdio |
| Authentication | Microsoft Entra ID OAuth in the client, with your own app registration for ChatGPT, Claude and Copilot Studio | Your developer token and refresh token in environment variables |
| Documented tools | 9 tools, which Microsoft states never modify account data | 20 read tools and 23 opt-in write tools |
| Entity reads | Accounts, campaigns, ad groups, ads, keywords, asset groups, assets and audience associations, with filtering, sorting, pagination and optional performance metrics | Accounts, campaigns, ad groups, ads, keywords, targeting criteria, audiences, UET tags, conversion goals, media, videos and asset groups, as native REST objects |
| Reporting | Performance metrics on entity tools, asset performance and account change history | The asynchronous Reporting API with 8 report types and their native columns |
| Writes | None | Create and update with preview and confirmation, created Paused |

## Hosted option

[getmcpads for Microsoft Advertising](https://www.getmcpads.com/tools/bing-ads) manages the hosted connection and account selection.
Hosted and source releases can differ. Contact: hello@getmcpads.com.

## Development

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run catalog
```

All tests run offline with synthetic responses. No live account is changed.

## Tools

Every tool is listed below. See [server-card.json](server-card.json) for complete parameter and output schemas. The `bing-ads://guide` resource returns the same coverage, safety and limitation notes as `bing_get_setup_guide`.

<details>
<summary><b>20 read tools</b></summary>

| Tool | Purpose |
| --- | --- |
| `bing_list_accounts` | List the configured accounts this user can reach, with name, number, currency, status and owning customer. |
| `bing_health_check` | Read the selected account and confirm the environment, owning customer and currency. |
| `bing_get_campaigns` | Read native campaign configuration, budget, settings and status for one campaign type. |
| `bing_get_ad_groups` | Read ad groups and their native configuration in an owned campaign. |
| `bing_get_ads` | Read ads with their native creative assets, URLs and status, for the ad formats you list. |
| `bing_get_keywords` | Read keywords, match types, bids and status from an owned ad group. |
| `bing_get_targeting` | Read configured campaign or ad group targeting for one criterion type. |
| `bing_get_audiences` | Read audience configuration for one audience type. |
| `bing_get_uet_tags` | Read UET tracking tag configuration. |
| `bing_get_conversion_goals` | Read conversion goal configuration. |
| `bing_get_media` | Read metadata of uploaded media by ID, including image representations. |
| `bing_get_videos` | Read account video assets and their processing status. |
| `bing_get_asset_groups` | Read Performance Max asset groups with their creative configuration and status. |
| `bing_get_geo_file` | Get Microsoft's current geographic targeting file link. |
| `bing_list_ad_creatives` | List image assets linked to account-owned ads and Performance Max asset groups, in a bounded scan. |
| `bing_get_reporting_schema` | Read the pinned report types and the native columns each one supports. |
| `bing_get_write_schema` | Read the pinned native fields of an entity before a create or update. |
| `bing_get_setup_guide` | Read this server's coverage, safety rules and known limitations. |
| `bing_get_insights` | Submit an asynchronous report for the selected account and return a receipt. |
| `bing_get_report` | Poll and download a submitted report, up to 2,000 rows. |

</details>

<details>
<summary><b>23 write tools</b></summary>

Disabled by default. Calls preview unless explicitly confirmed. Check the configuration and exact schema before use.

| Tool | Purpose |
| --- | --- |
| `bing_create_campaign` | Create a campaign with native fields, Paused. |
| `bing_update_campaign` | Update a campaign with native fields. |
| `bing_create_ad_group` | Create an ad group in an owned campaign, Paused. |
| `bing_update_ad_group` | Update an ad group with native fields. |
| `bing_create_ad` | Create an ad in an owned ad group, Paused. |
| `bing_update_ad` | Update an ad with native fields. |
| `bing_create_keyword` | Create a keyword in an owned ad group, Paused. |
| `bing_update_keyword` | Update a keyword with native fields. |
| `bing_create_audience` | Create an account-scoped audience. |
| `bing_update_audience` | Update an account-owned audience. |
| `bing_rename_campaign` | Rename a campaign. The name is the only field that changes. |
| `bing_rename_ad_group` | Rename an ad group. The name is the only field that changes. |
| `bing_rename_account` | Rename the selected account through a full account update that keeps every other field. |
| `bing_import_video` | Import a video from a public HTTPS file that Microsoft fetches. |
| `bing_update_video` | Update the description of an account-owned video. |
| `bing_upload_image` | Upload image bytes to the account's media library. |
| `bing_create_asset_group` | Create a Performance Max asset group, Paused. |
| `bing_create_uet_tag` | Create a UET tag configuration. |
| `bing_create_conversion_goal` | Create a conversion goal, Paused and excluded from bidding. |
| `bing_add_campaign_targeting` | Add one campaign targeting criterion. |
| `bing_update_campaign_targeting` | Update one campaign targeting criterion. |
| `bing_add_ad_group_targeting` | Add one ad group targeting criterion. |
| `bing_update_ad_group_targeting` | Update one ad group targeting criterion. |

</details>

<details>
<summary><b>1 resource</b></summary>

| Resource | Purpose |
| --- | --- |
| `bing-ads://guide` | Coverage, account rules, safety rules, reporting behaviour and known limitations, as JSON. |

</details>

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

## More from getmcpads

[Meta Ads](https://github.com/get-mcp-ads/meta-ads-mcp-server) · [Google Ads](https://github.com/get-mcp-ads/google-ads-mcp-server) · [Google Analytics 4](https://github.com/get-mcp-ads/google-analytics-mcp-server) · [Google Search Console](https://github.com/get-mcp-ads/google-search-console-mcp-server) · [TikTok Ads](https://github.com/get-mcp-ads/tiktok-ads-mcp-server) · [Pinterest Ads](https://github.com/get-mcp-ads/pinterest-ads-mcp-server) · [X Ads](https://github.com/get-mcp-ads/x-ads-mcp-server)

Maintained by **Emmanuel** at [getmcpads](https://www.getmcpads.com). Questions: [hello@getmcpads.com](mailto:hello@getmcpads.com).
