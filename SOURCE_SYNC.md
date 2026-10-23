# Source synchronization

Reviewed on 2026-10-23 against getmcpads gateway revision `3e1c2c8`
(`apps/mcp/src/sources/bing_ads`).

## Synchronized

- The 42 native `bing_` tools of the gateway, with their names, parameters,
  ownership checks, preview behaviour and paused creation: 19 reads and 23 writes.
- The REST v13 transport: fixed operation list, scope headers, extra returned
  fields, HTTP 200 error bodies, PartialErrors kept with successful IDs, numeric
  error codes without provider messages, and no retry.
- Account discovery through GetUser and SearchAccounts, with full pagination and
  repeated-page detection.
- The refresh-token grant for Microsoft and Google identities.
- Asynchronous reports: pinned report types and columns, signed receipts, ZIP
  and CSV parsing with UTF-8 and UTF-16 byte-order marks, the 2,000-row cap and
  the report host check.
- The pinned write schemas (`src/schema.json`, checked 2026-09-11) and report
  columns (`src/report-columns.json`).
- The image inventory behind `bing_list_ad_creatives`.

## Added in the standalone server

- `bing_list_accounts`, so account discovery is reachable without the hosted
  account selection. It returns only configured accounts.
- `BING_ADS_*` configuration validated at startup, an account allowlist with an
  owning-customer check in the client as well as the tools, and a write gate in
  the client.
- `redirect: "error"` on every request, one host list, response size limits,
  private-address checks on report and video URLs, redaction of tool results,
  exact 64-bit IDs from JSON, and a ZIP reader without a third dependency.
- Report receipts signed with a per-process key instead of the hosted key.
- Strict tool input schemas: an undeclared argument is refused over MCP.

## Hosted only

Billing, plans and the production write release flag, workspaces and stored
account selection, the OAuth browser flow and token storage, request metering,
creative galleries, MCP Apps UI, the Launcher, alerts, Google Sheets exports,
client memory, telemetry, partner integrations and the discovery meta-tools are
outside this synchronization.

Validation uses synthetic data. No live advertising request or write is made by
the test suite. The generated server-card.json is the source of truth for this
revision's tool schemas.

Maintainer: Emmanuel, getmcpads. Contact: hello@getmcpads.com.
