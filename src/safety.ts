/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * URLs that come from the API or from a tool argument are data, never trusted
 * call targets. These checks run before anything is fetched or forwarded.
 */
import { REPORT_DOWNLOAD_HOST_SUFFIXES } from "./hosts.js";

/** Loopback, private, link-local, carrier-grade NAT, metadata and IP-literal hosts. */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || host.includes(":")) return true;
  if (host === "localhost" || host === "metadata" || host === "metadata.google.internal") return true;
  if (/\.(localhost|internal|local|lan|home|arpa)$/.test(host)) return true;
  // Decimal, octal or hexadecimal single-number hosts resolve to IPv4 addresses.
  if (/^(0x[0-9a-f]+|\d+)$/.test(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return !host.includes(".");
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function parse(raw: string): URL {
  try { return new URL(raw); } catch { throw new Error("Microsoft Advertising returned an invalid report URL."); }
}

/**
 * A report download URL must be HTTPS, carry no credentials or port, sit on a
 * Microsoft report host and never point at a private or local address.
 */
export function assertSafeReportUrl(raw: string): URL {
  const url = parse(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || isPrivateOrLocalHost(host) ||
      !REPORT_DOWNLOAD_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))) {
    throw new Error("Microsoft Advertising returned an untrusted report host. The report was not downloaded.");
  }
  return url;
}

/** A source URL that Microsoft will fetch on the user's behalf (video import). */
export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  return url.protocol === "https:" && !url.username && !url.password && !url.port && !isPrivateOrLocalHost(url.hostname);
}

/** HTTPS media URL returned by the API, with no credentials or custom port. Returned as data only. */
export function httpsMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port) return url.href;
  } catch { /* Not a usable media URL. */ }
  return undefined;
}
