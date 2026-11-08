# Security Policy

This server holds credentials that can read, and when writes are enabled
modify, live Microsoft Advertising accounts. We take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:
[Report a vulnerability](https://github.com/get-mcp-ads/bing-ads-mcp-server/security/advisories/new),
or write to hello@getmcpads.com. Do not include live tokens or customer data.

We aim to acknowledge a report within 3 business days and to ship a fix or a
documented mitigation within 30 days. We will credit you in the advisory unless
you ask us not to.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## What this server does with your credentials

- The developer token, OAuth client and refresh token are read once from the
  environment at startup. Access tokens are obtained with the refresh token and
  kept in memory. A rotated refresh token is also kept in memory only. Nothing
  is written to disk or logged.
- **Requests go only to the hosts listed in `src/hosts.ts`**: the Microsoft
  Advertising campaign, customer and reporting API hosts for production and
  sandbox, `login.microsoftonline.com` for tokens, and `oauth2.googleapis.com`
  when Google identity is configured. *A test fails the build if another host
  appears in the source.*
- **No fetch follows a redirect.** Every outbound call sets `redirect: "error"`,
  so a redirect cannot forward a credential to another host. *A test fails the
  build if any fetch omits this.*
- Every request has a timeout and a response size limit.
- Provider error messages are never echoed. Errors carry the numeric code, the
  symbolic error name and the TrackingId only. Known secrets and credential-like
  fields are redacted from every tool result.
- No telemetry, no analytics, no phone-home.

## Account allowlist

Only the accounts in `BING_ADS_ACCOUNT_IDS` are reachable. The check runs
before every account-bound request, and account discovery returns only those
accounts. Before data is returned or changed, the server reads the account and
stops unless Microsoft reports the configured customer as its owner.

## Report downloads

Microsoft runs reports asynchronously and returns a download link. That link is
**data returned by the API**, so it is validated before it is fetched:

- HTTPS only, with no credentials and no custom port.
- The host must end in `.bingads.microsoft.com` or `.blob.core.windows.net`.
- No loopback, private, link-local or metadata address.
- No redirect followed and no credential attached.
- The archive and the expanded CSV are limited to 10 MB.

Report receipts are signed with a random key that exists only in memory, and
bind a report to its account and environment for one hour.

## Writes

Write tools exist only when `BING_ADS_ENABLE_WRITES` is exactly `true`. Every
write previews unless `confirm: true`. New campaigns, ad groups, ads, keywords
and asset groups are created Paused. A write whose outcome is uncertain is never
retried automatically.

## Handling your credentials safely

- Treat the developer token, client secret and refresh token like passwords.
- Your MCP client config file is usually plain text on disk. Check its
  permissions, and never commit it.
- Revoke the app's consent in your Microsoft account if you suspect exposure.

## Scope

Vulnerabilities in the Microsoft Advertising API itself are not in scope here;
report those to Microsoft.
