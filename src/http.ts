/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export const REDACTED = "[REDACTED]";
/** Upper bound for one Microsoft Advertising API response body. */
export const MAX_API_RESPONSE_BYTES = 10_000_000;
export const REQUEST_TIMEOUT_MS = 30_000;

/** Reads a response body without ever holding more than `max` bytes. */
export async function readBounded(response: Response, max: number, label: string): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${label} exceeded ${Math.round(max / 1_000_000)} MB. Narrow the request.`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new Error(`${label} exceeded ${Math.round(max / 1_000_000)} MB. Narrow the request.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown;

/**
 * Microsoft returns 64-bit IDs as JSON numbers. Keyword and asset IDs can pass
 * 2^53, where a plain JSON.parse silently rounds them to a different entity.
 * Integers that are not exactly representable are kept as their source text.
 */
export function parseJsonPreservingIds(text: string): unknown {
  const reviver: Reviver = (_key, value, context) =>
    typeof value === "number" && !Number.isSafeInteger(value) && typeof context?.source === "string" && /^-?\d+$/.test(context.source)
      ? context.source
      : value;
  return (JSON.parse as (text: string, reviver: Reviver) => unknown)(text, reviver);
}

const SECRET_KEYS = /^(access_?token|refresh_?token|id_?token|client_?secret|authentication_?token|developer_?token|password|authorization)$/i;

/** Replaces values stored under credential-like keys, at any depth. */
export function redactSecretFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, SECRET_KEYS.test(key) ? REDACTED : redactSecretFields(nested)]));
}

/** Replaces every occurrence of a known secret in free text. */
export function redactText(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join(REDACTED);
  return out;
}
