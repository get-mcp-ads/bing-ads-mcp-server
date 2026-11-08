# Contributing

Thanks for considering a contribution. This project is maintained by
[GetMCPAds](https://www.getmcpads.com) and is open to outside patches.

## Getting set up

```bash
git clone https://github.com/get-mcp-ads/bing-ads-mcp-server.git
cd bing-ads-mcp-server
npm ci
cp .env.example .env
```

Then run the checks:

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

All four must pass. CI runs them on Node 22, 24 and 26.

## Ground rules

**Never commit a credential.** `.env` is gitignored. Before opening a PR, read
your diff for developer tokens, client secrets and refresh tokens.

**Tests use synthetic data.** Do not add a test that needs live credentials to
pass; CI has none, and no test may change a live account.

**Native field and column names are the load-bearing part.** This server passes
Microsoft's REST field names and report columns as they are. If you add or
change one, link the Microsoft Advertising API reference in the PR description.

**Keep the account allowlist and the ownership check.** Every account-bound
request goes through the allowlist, and every confirmed call first reads the
account and its owning customer.

**Keep the report link guarded.** `assertSafeReportUrl` refuses anything that is
not HTTPS on a Microsoft report host. Removing that check reopens a
request-forgery path.

**Write tools must preview first.** Any new write tool has to accept `confirm`
and return a preview when it is absent. New entities are created Paused. A tool
that changes an account on the first call will not be merged.

**Keep it self-contained.** Runtime dependencies are `@modelcontextprotocol/sdk`
and `zod`. Adding a third needs a good reason.

**Write documentation in English, without em dashes.** A test checks this.

## Credentials never reach the logs or another host

Two tests enforce this: one fails if any `fetch` omits `redirect: "error"`, and
one fails if a host outside `src/hosts.ts` appears in the source.

## Commit and PR style

- One logical change per PR.
- Explain why, not only what. The diff already shows what.
- If you fix a bug, add the test that would have caught it.

## Reporting bugs

Open an issue with what you called, what you expected, what you got, and the
TrackingId from the error when there is one. Redact IDs and tokens.

For anything security-related, do not open an issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the
Apache License 2.0, as stated in [LICENSE](LICENSE).
