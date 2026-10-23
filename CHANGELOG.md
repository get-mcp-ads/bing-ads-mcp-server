# Changelog

## 1.0.0 - 2026-10-23 - First standalone release
- First standalone release, ported from the native Microsoft Advertising tools of the getmcpads gateway at revision 3e1c2c8.
- 20 read tools: account discovery, campaigns, ad groups, ads, keywords, targeting, audiences, UET tags, conversion goals, media, videos, Performance Max asset groups, image inventory, write and report schemas, and asynchronous reports.
- 23 write tools, disabled by default: create and update campaigns, ad groups, ads, keywords and audiences, targeting criteria, asset groups, UET tags and conversion goals, renames, image upload and video import. Every write previews unless `confirm: true`; new entities are created Paused.
- Credentials come from `BING_ADS_*` environment variables. Access tokens are renewed from the refresh token in memory only.
- Explicit account allowlist with an owning-customer check, fixed API and token hosts, no redirects, timeouts, bounded responses and credential redaction.
- Requires Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release of those lines, and warns on stderr otherwise.
