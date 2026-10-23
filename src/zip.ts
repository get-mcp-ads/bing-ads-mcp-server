/**
 * bing-ads-mcp-server: an open-source MCP server for Microsoft Advertising (Bing Ads API).
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal ZIP reader for Microsoft report downloads, which arrive as an archive
 * holding one CSV file. Only stored and deflated entries are read, sizes are
 * bounded before and during decompression, and nothing touches the disk.
 */
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function fail(reason: string): never {
  throw new Error(`Microsoft Advertising report archive ${reason}.`);
}

/** Returns the bytes of the single CSV entry, refusing archives over `maxBytes` once expanded. */
export function extractSingleCsv(bytes: Uint8Array, maxBytes: number, maxEntries = 5): Uint8Array {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) { end = i; break; }
  }
  if (end < 0) fail("is incomplete");
  const count = buf.readUInt16LE(end + 10);
  const directory = buf.readUInt32LE(end + 16);
  if (count > maxEntries) fail("holds too many files");
  if (directory === 0xffffffff || directory >= buf.length) fail("uses an unsupported layout");
  const found: Uint8Array[] = [];
  let expanded = 0;
  let p = directory;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) fail("has an invalid directory");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28), extraLength = buf.readUInt16LE(p + 30), commentLength = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    expanded += size;
    if (expanded > maxBytes) fail("exceeds the size limit once expanded; narrow the date range");
    if (!/\.csv$/i.test(name)) continue;
    if (flags & 1) fail("is encrypted");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) fail("has an invalid entry");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + compressed > buf.length) fail("is truncated");
    const data = buf.subarray(start, start + compressed);
    let out: Uint8Array;
    if (method === 0) out = data;
    else if (method === 8) {
      try { out = inflateRawSync(data, { maxOutputLength: Math.max(1, size) }); } catch { fail("could not be decompressed within its declared size"); }
    } else fail("uses an unsupported compression method");
    if (out.length !== size) fail("does not match its declared size");
    found.push(out);
  }
  if (found.length !== 1) fail("did not contain exactly one CSV file");
  return found[0]!;
}
