import { crc32, deflateRawSync } from "node:zlib";
import { vi } from "vitest";
import { BingClient } from "../../src/client.js";
import { validateConfig, type BingConfigInput } from "../../src/config.js";
import { registerBingReads, registerBingWrites, type Collector } from "../../src/tools.js";

export const SECRETS = { refreshToken: "test-refresh-secret-123", clientSecret: "test-client-secret-456", developerToken: "test-developer-token-789", accessToken: "test-access-secret-000" };
export const base: BingConfigInput = {
  environment: "sandbox", identityProvider: "Microsoft", clientId: "client-id", clientSecret: SECRETS.clientSecret,
  refreshToken: SECRETS.refreshToken, allowedAccounts: { "1": "2" }, enableWrites: true,
};
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
export const token = (accessToken = SECRETS.accessToken, extra: Record<string, unknown> = {}) => json({ access_token: accessToken, expires_in: 3600, ...extra });
const isToken = (url: unknown) => String(url).includes("/oauth2/") || String(url).includes("oauth2.googleapis.com");

/** Stubs fetch: token requests get a token, other calls get the queued responses in order. */
export function provider(...responses: (Response | ((url: string, init: RequestInit) => Response))[]) {
  const queue = [...responses];
  const fetcher = vi.fn(async (url: unknown, init: RequestInit = {}) => {
    if (isToken(url)) return token();
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${String(url)}`);
    return typeof next === "function" ? next(String(url), init) : next;
  });
  vi.stubGlobal("fetch", fetcher);
  const api = () => fetcher.mock.calls.filter(([url]) => !isToken(url));
  return { fetcher, api, bodies: () => api().map(([, init]) => JSON.parse(String((init as RequestInit).body))) };
}

export function tools(overrides: Partial<BingConfigInput> = {}) {
  const config = validateConfig({ ...base, ...overrides });
  const entries = new Map<string, { handler: (a: Record<string, unknown>) => Promise<unknown>; shape: Record<string, unknown>; description: string }>();
  const collector: Collector = { tool: (name, description, shape, handler) => { entries.set(name, { handler, shape, description }); } };
  const api = new BingClient(config);
  registerBingReads(collector, config, api);
  if (config.enableWrites) registerBingWrites(collector, config, api);
  const run = async (name: string, args: Record<string, unknown> = {}) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`No tool ${name}`);
    const result = await entry.handler(args) as { content: { text: string }[]; isError?: boolean };
    return { data: JSON.parse(result.content[0]!.text), text: result.content[0]!.text, isError: result.isError === true };
  };
  return { run, entries, api, config };
}

/** Builds a ZIP archive with deflated entries, as Microsoft report downloads are. */
export function makeZip(files: Record<string, Uint8Array | string>, method: 0 | 8 = 8): Uint8Array {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(typeof content === "string" ? Buffer.from(content, "utf8") : content);
    const packed = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed); centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}
