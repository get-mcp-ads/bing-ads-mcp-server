# Changelog

## 1.0.1 - 2026-10-26 - Zod 4 security update
- Update `zod` to 4.6.7. Every Zod release before 4.6.6 is covered by the high-severity advisory GHSA-mrhx-c7xc-m3w5: validating an oversized constrained collection can exhaust memory, and no Zod 3 release carries the fix. `npm audit --omit=dev` reports no vulnerability again.
- Keep the Zod 3 validation behaviour. A parameter default is still validated and completed before use, so an omitted object must still supply its required fields.
- Keep each parameter's own description when the parameter is optional or has a default. Zod 4 stores a description on the wrapped schema only, so the shared fallback description could otherwise replace it.
- Tool names, parameters and descriptions published over MCP are unchanged. `server-card.json` is regenerated with Zod 4's JSON Schema output, which spells some constraints differently.

## 1.0.0 - 2026-10-23 - First standalone release
- First standalone release, ported from the native Microsoft Advertising tools of the getmcpads gateway at revision 3e1c2c8.
- 20 read tools: account discovery, campaigns, ad groups, ads, keywords, targeting, audiences, UET tags, conversion goals, media, videos, Performance Max asset groups, image inventory, write and report schemas, and asynchronous reports.
- 23 write tools, disabled by default: create and update campaigns, ad groups, ads, keywords and audiences, targeting criteria, asset groups, UET tags and conversion goals, renames, image upload and video import. Every write previews unless `confirm: true`; new entities are created Paused.
- Credentials come from `BING_ADS_*` environment variables. Access tokens are renewed from the refresh token in memory only.
- Explicit account allowlist with an owning-customer check, fixed API and token hosts, no redirects, timeouts, bounded responses and credential redaction.
- Requires Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release of those lines, and warns on stderr otherwise.
