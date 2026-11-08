/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { SANDBOX_DEVELOPER_TOKEN, isBingId, type BingConfig } from "./config.js";
import { apiBase, assertAllowedRequestUrl } from "./hosts.js";
import { MAX_API_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, parseJsonPreservingIds, readBounded } from "./http.js";
import { refreshAccessToken } from "./oauth.js";
import { BING_OPERATIONS, type BingOperation } from "./operations.js";

export type BingRow = Record<string, unknown>;
export type BingScope = { accountId: string; customerId: string };
export type BingAccount = { id: string; customerId: string; name: string; number?: string; currency?: string; status?: string };

/** Accepts a positive 64-bit ID as a string, or a safe integer. Rounded numbers are refused. */
export function bingId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && isBingId(value)) return value;
  throw new Error("Invalid Microsoft Advertising ID. Use the numeric ID, not the account number.");
}

function record(value: unknown): BingRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Microsoft Advertising returned an invalid response.");
  return value as BingRow;
}

/** Documented operation error codes that change what the caller should do next. */
const HINTS: Record<string, string> = {
  "105": "The credentials were refused. Check BING_ADS_DEVELOPER_TOKEN and the OAuth client.",
  "106": "This user is not authorized for the account. Check its access in Microsoft Advertising and the customer ID.",
  "109": "The access token expired. Retry the read; the server renews tokens before expiry.",
  "117": "Call rate exceeded. Wait before retrying. Nothing was retried automatically.",
};

export class BingApiError extends Error {
  constructor(readonly status: number, readonly codes: string[], readonly trackingId: string | null, write: boolean) {
    const hint = codes.map(code => HINTS[code.split(" ")[0]!]).find(Boolean);
    super(`Microsoft Advertising API returned HTTP ${status}${codes.length ? ` (${codes.join(", ")})` : ""}.` +
      (hint ? ` ${hint}` : "") +
      (write ? " Read the account to reconcile before any retry; the change may be partly applied." : "") +
      (trackingId ? ` TrackingId ${trackingId}.` : ""));
    this.name = "BingApiError";
  }
}

/** Fields Microsoft omits unless requested: CPV/CPM bidding, video and ad subtypes. */
const ADDITIONAL_FIELDS: Partial<Record<BingOperation, string>> = {
  getcampaignsbyaccountid: "CpvCpmBiddingScheme", getcampaignsbyids: "CpvCpmBiddingScheme",
  getadgroupsbycampaignid: "AdGroupType, CpvBid, CpmBid, UsePredictiveTargeting", getadgroupsbyids: "AdGroupType, CpvBid, CpmBid, UsePredictiveTargeting",
  getadsbyadgroupid: "Videos, AdSubType, LongHeadlines",
};

/**
 * Internal transport, not an arbitrary-request tool. One attempt per call and
 * no retries, so an uncertain write is never replayed. The environment is fixed
 * at construction. Microsoft can return successful IDs and PartialErrors in the
 * same HTTP 200; both are kept so the caller reconciles instead of resending.
 */
export class BingClient {
  private readonly config: Readonly<BingConfig>;
  private refreshToken: string;
  private token: { value: string; expiresAt: number } | undefined;
  private refreshing: Promise<string> | undefined;

  constructor(config: BingConfig) {
    if (config.environment !== "production" && config.environment !== "sandbox") throw new Error("Explicit Microsoft Advertising environment required.");
    if (config.identityProvider !== "Microsoft" && config.identityProvider !== "Google") throw new Error("Explicit Microsoft Advertising identity provider required.");
    if (config.environment === "production" && (!config.developerToken || config.developerToken === SANDBOX_DEVELOPER_TOKEN)) {
      throw new Error("Production requires your own Microsoft Advertising developer token.");
    }
    this.config = Object.freeze({ ...config, allowedAccounts: Object.freeze({ ...config.allowedAccounts }) });
    this.refreshToken = config.refreshToken;
  }

  /** Values that must never reach a tool result, current refresh token included. */
  secrets(): string[] {
    return [this.token?.value, this.refreshToken, this.config.refreshToken, this.config.clientSecret,
      this.config.environment === "production" ? this.config.developerToken : undefined].filter((v): v is string => Boolean(v));
  }

  /** Access tokens live in memory only and are renewed a minute before they expire. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value;
    this.refreshing ??= (async () => {
      try {
        const tokens = await refreshAccessToken(this.config, this.refreshToken);
        this.refreshToken = tokens.refreshToken;
        this.token = { value: tokens.accessToken, expiresAt: Date.now() + tokens.expiresIn * 1000 };
        return tokens.accessToken;
      } finally {
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }

  private assertSelected(scope: BingScope): void {
    if (!Object.hasOwn(this.config.allowedAccounts, scope.accountId) || this.config.allowedAccounts[scope.accountId] !== scope.customerId) {
      throw new Error("Microsoft Advertising account is not in BING_ADS_ACCOUNT_IDS.");
    }
  }

  async request(operation: BingOperation, body: BingRow, scope?: BingScope): Promise<BingRow> {
    if (!Object.hasOwn(BING_OPERATIONS, operation)) throw new Error("Unsupported Microsoft Advertising operation.");
    const spec = BING_OPERATIONS[operation];
    if (spec.write && this.config.enableWrites !== true) throw new Error("Microsoft Advertising writes are disabled. Set BING_ADS_ENABLE_WRITES=true to enable them.");
    const url = `${apiBase(this.config.environment, spec.service)}${spec.path}`;
    assertAllowedRequestUrl(url);
    const headers: Record<string, string> = {
      DeveloperToken: this.config.environment === "sandbox" ? SANDBOX_DEVELOPER_TOKEN : this.config.developerToken!,
      "Content-Type": "application/json", Accept: "application/json",
      ...(this.config.identityProvider === "Google" ? { IdentityProvider: "Google" } : {}),
    };
    if (scope) this.assertSelected(scope);
    if (spec.service === "campaign" || (spec.service === "reporting" && scope)) {
      if (!scope) throw new Error("Microsoft Advertising account and customer scope required.");
      headers.CustomerAccountId = bingId(scope.accountId);
      headers.CustomerId = bingId(scope.customerId);
      if (body.AccountId != null && bingId(body.AccountId) !== headers.CustomerAccountId) throw new Error("Microsoft Advertising account scope mismatch.");
    }
    if (spec.service === "customer" && operation !== "getuser" && operation !== "searchaccounts") {
      const target = body.AccountId ?? (body.Account as BingRow | undefined)?.Id;
      if (!scope || target == null || bingId(target) !== scope.accountId) throw new Error("Microsoft Advertising account scope mismatch.");
    }
    const extra = ADDITIONAL_FIELDS[operation];
    const requestBody = extra ? { ReturnAdditionalFields: extra, ...body } : body;
    headers.Authorization = `Bearer ${await this.accessToken()}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: spec.method, headers, body: JSON.stringify(requestBody), redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error(spec.write
        ? "The Microsoft Advertising request did not complete, so its outcome is unknown. Read the account before retrying."
        : "The Microsoft Advertising request did not complete. Check the network and retry.");
    }
    let result: BingRow;
    try {
      result = record(parseJsonPreservingIds(new TextDecoder().decode(await readBounded(response, MAX_API_RESPONSE_BYTES, "Microsoft Advertising response"))));
    } catch (error) {
      if (error instanceof Error && /exceeded/.test(error.message)) throw error;
      throw new BingApiError(response.status, ["invalid_response"], null, spec.write);
    }
    // Microsoft can report a failed call inside an HTTP 200 body.
    const errors = [result.Errors, result.OperationErrors, result.BatchErrors].flatMap(v => Array.isArray(v) ? v : []);
    if (!response.ok || errors.length) {
      // Free-form provider messages are never echoed: they can quote request values.
      const codes = errors.flatMap(error => {
        const row = error && typeof error === "object" ? error as BingRow : {};
        if (typeof row.Code !== "number" || !Number.isSafeInteger(row.Code)) return [];
        const name = typeof row.ErrorCode === "string" && /^[A-Za-z]{1,64}$/.test(row.ErrorCode) ? ` ${row.ErrorCode}` : "";
        return [`${row.Code}${name}`];
      }).slice(0, 20);
      const tracking = response.headers.get("TrackingId");
      throw new BingApiError(response.status, codes, tracking && /^[a-zA-Z0-9-]{1,80}$/.test(tracking) ? tracking : null, spec.write);
    }
    return result;
  }

  /**
   * Enumerates every account the user can reach, page by page, or fails
   * explicitly. A truncated hierarchy is never presented as complete. No user
   * personal data from GetUser is returned.
   */
  async accounts(): Promise<BingAccount[]> {
    const user = record((await this.request("getuser", { UserId: null })).User);
    const userId = bingId(user.Id);
    const found = new Map<string, BingAccount>();
    const pages = new Set<string>();
    for (let index = 0; index < 100; index++) {
      const result = await this.request("searchaccounts", {
        Predicates: [{ Field: "UserId", Operator: "Equals", Value: userId }], PageInfo: { Index: index, Size: 100 },
      });
      if (!Array.isArray(result.Accounts)) throw new Error("Microsoft Advertising account discovery returned an invalid list.");
      const rows = result.Accounts.map(record);
      const fingerprint = rows.map(row => bingId(row.Id)).join(",");
      if (rows.length && pages.has(fingerprint)) throw new Error("Microsoft Advertising account pagination repeated; discovery is incomplete.");
      pages.add(fingerprint);
      for (const row of rows) {
        const id = bingId(row.Id);
        found.set(id, {
          id, customerId: bingId(row.ParentCustomerId), name: typeof row.Name === "string" ? row.Name : id,
          ...(typeof row.Number === "string" ? { number: row.Number } : {}),
          ...(typeof row.CurrencyCode === "string" ? { currency: row.CurrencyCode } : {}),
          ...(typeof row.AccountLifeCycleStatus === "string" ? { status: row.AccountLifeCycleStatus } : {}),
        });
      }
      if (rows.length < 100) return [...found.values()];
    }
    throw new Error("Microsoft Advertising account discovery exceeded its pagination limit.");
  }
}
