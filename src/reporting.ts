/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BingClient, BingRow, BingScope } from "./client.js";
import type { BingConfig } from "./config.js";
import { REQUEST_TIMEOUT_MS, readBounded } from "./http.js";
import { assertSafeReportUrl } from "./safety.js";
import { extractSingleCsv, isZip } from "./zip.js";

/** Native ReportTimeZone values this server accepts, with their IANA zone for reference. */
export const BING_REPORT_TIMEZONES: Record<string, string> = {
  PacificTimeUSCanadaTijuana: "America/Los_Angeles",
  BrusselsCopenhagenMadridParis: "Europe/Paris",
  AmsterdamBerlinBernRomeStockholmVienna: "Europe/Berlin",
  GreenwichMeanTimeDublinEdinburghLisbonLondon: "Europe/London",
  EasternTimeUSCanada: "America/New_York", CentralTimeUSCanada: "America/Chicago",
  MountainTimeUSCanada: "America/Denver", Arizona: "America/Phoenix",
  Hawaii: "Pacific/Honolulu", Alaska: "America/Anchorage",
  OsakaSapporoTokyo: "Asia/Tokyo", KualaLumpurSingapore: "Asia/Singapore",
  ChennaiKolkataMumbaiNewDelhi: "Asia/Kolkata", CanberraMelbourneSydney: "Australia/Sydney",
  Brisbane: "Australia/Brisbane", Perth: "Australia/Perth", AucklandWellington: "Pacific/Auckland",
};

export const MAX_REPORT_BYTES = 10_000_000;
export const MAX_REPORT_ROWS = 2000;

function decode(bytes: Uint8Array): string {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: false }).decode(bytes).replace(/^\uFEFF/, "");
}

/** RFC 4180 fields, including escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if (c === "\n" && !quoted) { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("Microsoft Advertising report CSV is incomplete.");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

/**
 * Downloads a report file from the URL Microsoft returned. The URL is checked
 * first, no credential is attached and no redirect is followed. Archives and
 * expanded CSV are bounded at 10 MB; values stay strings, as Microsoft wrote them.
 */
export async function readBingReport(url: string) {
  const target = assertSafeReportUrl(url);
  let response: Response;
  try {
    response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new Error("The Microsoft Advertising report download did not complete. Poll again for a fresh link.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Microsoft Advertising report download failed (HTTP ${response.status}). Poll again for a fresh link.`);
  }
  const bytes = await readBounded(response, MAX_REPORT_BYTES, "Microsoft Advertising report");
  let text: string;
  try {
    text = decode(isZip(bytes) ? extractSingleCsv(bytes, MAX_REPORT_BYTES) : bytes);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Microsoft Advertising")) throw error;
    throw new Error("Microsoft Advertising report is not valid UTF-8 or UTF-16 text.");
  }
  const rows = parseCsv(text);
  const header = rows.findIndex(r => r.some(c => c === "AccountId" || c === "Account ID" || c === "AccountNumber" || c === "Account Number"));
  if (header < 0) throw new Error("Microsoft Advertising report header missing.");
  const columns = rows[header]!;
  if (new Set(columns).size !== columns.length) throw new Error("Microsoft Advertising report contains duplicate columns.");
  const records = rows.slice(header + 1).filter(r => r.some(Boolean));
  if (records.some(r => r.length !== columns.length)) throw new Error("Microsoft Advertising report contains an incomplete row.");
  const limited = records.slice(0, MAX_REPORT_ROWS);
  return {
    columns,
    rows: limited.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))),
    rowCount: records.length,
    truncated: records.length > MAX_REPORT_ROWS,
    monetaryValues: "Account currency units as reported by Microsoft; inspect the account currency.",
    environmentNote: "Sandbox rows are test data, not evidence of live spend or attribution.",
  };
}

export async function pollBingReport(api: BingClient, reportId: string, scope: BingScope) {
  const r = (await api.request("pollgeneratereport", { ReportRequestId: reportId }, scope)).ReportRequestStatus as BingRow | undefined;
  if (!r || !["Success", "Pending", "Error"].includes(String(r.Status))) throw new Error("Microsoft Advertising report returned an invalid status.");
  if (r.Status !== "Success") return { status: r.Status, rows: null, ...(r.Status === "Pending" ? { next: "Poll bing_get_report again shortly." } : {}) };
  if (!r.ReportDownloadUrl) return { status: "Success", rows: [], rowCount: 0, noData: true, note: "Microsoft returned no report file for this period." };
  if (typeof r.ReportDownloadUrl !== "string") throw new Error("Microsoft Advertising report URL is invalid.");
  return { status: "Success", ...(await readBingReport(r.ReportDownloadUrl)) };
}

/**
 * Report receipts bind a report request to its account and environment. The
 * signing key is random per process and never leaves memory, so a receipt
 * expires after an hour or when the server restarts.
 */
const SIGNING_KEY = randomBytes(32);
type Binding = Pick<BingConfig, "environment" | "identityProvider">;
const sign = (payload: string, key: Buffer) => createHmac("sha256", key).update(payload).digest("base64url");

export function reportReceipt(config: Binding, accountId: string, reportId: string, key: Buffer = SIGNING_KEY, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ environment: config.environment, identityProvider: config.identityProvider, accountId, reportId, expires: now + 3_600_000 })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyReportReceipt(receipt: string, config: Binding, accountId: string, key: Buffer = SIGNING_KEY, now = Date.now()): string {
  const [payload, signature, extra] = receipt.split(".");
  const expected = payload ? Buffer.from(sign(payload, key)) : Buffer.alloc(0);
  const given = Buffer.from(signature ?? "");
  if (!payload || !signature || extra !== undefined || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("Microsoft Advertising report receipt is invalid. Submit the report again with bing_get_insights.");
  }
  let p: Record<string, unknown>;
  try { p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new Error("Microsoft Advertising report receipt is invalid."); }
  if (p.accountId !== accountId || p.environment !== config.environment || p.identityProvider !== config.identityProvider ||
      typeof p.expires !== "number" || p.expires < now || typeof p.reportId !== "string" || !p.reportId) {
    throw new Error("Microsoft Advertising report receipt belongs to another account or has expired. Submit the report again.");
  }
  return p.reportId;
}
