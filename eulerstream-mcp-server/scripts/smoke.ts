/**
 * Self-check against a LOCAL MOCK of the Euler API (no network, no real key).
 * Run: npm run build && npm run smoke
 */
import { strict as assert } from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const seen: { method: string; url: string; key: string | undefined; body: string }[] = [];
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    seen.push({ method: req.method ?? "", url: req.url ?? "", key: req.headers["x-api-key"] as string | undefined, body });
    const send = (code: number, obj: unknown, extra: Record<string, string> = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...extra }); res.end(JSON.stringify(obj)); };
    if (req.headers["x-api-key"] !== "euler_TESTKEY_1234567890abcdef") return send(401, { code: 401, message: "The provided API Key is invalid." });
    const u = req.url ?? "";
    if (u === "/accounts/me") return send(200, { code: 200, account: { id: 42, name: "demo", webhook_secret: "whsec_abcdefghijklmnop", max_websockets: 5 } });
    if (u.startsWith("/accounts/me/rate_limits")) return send(200, { code: 200, day: { max: 100, remaining: 7, reset_at: null } });
    if (u === "/accounts/42/api_keys/list") return send(200, { code: 200, keys: [{ id: 1, name: "k1", value: "x", key: "euler_SECRETSECRETSECRET1234" }] });
    if (u === "/webcast/anchors/someone/room_id") return send(200, { code: 200, ok: true, is_live: true, room_id: "7123456789" });
    if (u === "/webcast/anchors/ratelimited/room_id") return send(429, { message: "slow down" }, { "retry-after": "12" });
    if (u === "/webcast/anchors/ghost/room_id") return send(404, { message: "user not found" });
    if (u === "/webcast/bulk_live_check" && req.method === "POST") return send(200, { code: 200, echo: JSON.parse(body) });
    if (u.startsWith("/webcast/gifts/catalog?")) return send(200, { q: u });
    if (u === "/webcast/gifts") return send(200, { gifts: [1, 2, 3] });
    if (u === "/webcast/websockets/42") return send(200, { code: 200, websockets: [] });
    if (u === "/webcast/big") return send(200, { blob: "x".repeat(60_000) });
    return send(404, { message: "no such mock route " + u });
  });
});
await new Promise<void>(r => mock.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;

async function connect(key: string) {
  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...getDefaultEnvironment(), EULER_API_KEY: key, EULER_API_BASE: base } }));
  return client;
}
const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text) ?? "";
const client = await connect("euler_TESTKEY_1234567890abcdef");

const { tools } = await client.listTools();
const names = tools.map(t => t.name).sort();
assert.equal(names.length, 15, names.join());
assert.ok(names.every(n => n.startsWith("euler_")));
assert.ok(tools.every(t => t.annotations?.readOnlyHint === true), "all tools are read-only");

// account: key sent in header, secret masked
let r = await client.callTool({ name: "euler_get_account", arguments: {} });
assert.ok(!r.isError); assert.ok(textOf(r).includes('"id": 42')); assert.ok(!textOf(r).includes("whsec_abcdefghijklmnop"), "webhook secret masked");
assert.equal(seen.at(-1)?.key, "euler_TESTKEY_1234567890abcdef");

// default account id resolution + masking of keys
r = await client.callTool({ name: "euler_list_api_keys", arguments: {} });
assert.ok(!r.isError); assert.ok(!textOf(r).includes("SECRETSECRETSECRET"), "api key masked"); assert.ok(textOf(r).includes("…"));

r = await client.callTool({ name: "euler_get_rate_limits", arguments: { type: "WEBCAST" } });
assert.ok(textOf(r).includes('"remaining": 7')); assert.ok(seen.at(-1)?.url.includes("type=WEBCAST"));

// '@' stripped, path encoded
r = await client.callTool({ name: "euler_get_room_id", arguments: { unique_id: "@someone" } });
assert.ok(textOf(r).includes("7123456789"));

// error mapping with recovery advice
r = await client.callTool({ name: "euler_get_room_id", arguments: { unique_id: "ratelimited" } });
assert.equal(r.isError, true); assert.ok(textOf(r).includes("Retry after 12s") && textOf(r).includes("euler_get_rate_limits"));
r = await client.callTool({ name: "euler_get_room_id", arguments: { unique_id: "ghost" } });
assert.equal(r.isError, true); assert.ok(textOf(r).includes("404"));

// POST body
r = await client.callTool({ name: "euler_check_live", arguments: { user_numeric_ids: ["123", "456"] } });
assert.ok(textOf(r).includes('"123"')); assert.equal(seen.at(-1)?.method, "POST");

// catalog query params
r = await client.callTool({ name: "euler_list_gift_catalog", arguments: { page_size: 5, order_by: "name", ascending: true } });
assert.ok(textOf(r).includes("pageSize=5") && textOf(r).includes("orderBy=name") && textOf(r).includes("ascending=true"));

r = await client.callTool({ name: "euler_list_websockets", arguments: {} });
assert.ok(!r.isError);

// validation + raw_get guard + truncation
assert.equal((await client.callTool({ name: "euler_get_room_id", arguments: { unique_id: "bad name!" } })).isError, true);
assert.equal((await client.callTool({ name: "euler_check_live", arguments: { user_numeric_ids: ["abc"] } })).isError, true);
assert.equal((await client.callTool({ name: "euler_raw_get", arguments: { path: "/accounts/42/api_keys/delete" } })).isError, true, "non-whitelisted path rejected");
assert.equal((await client.callTool({ name: "euler_raw_get", arguments: { path: "/webcast/../accounts/x" } })).isError, true);
r = await client.callTool({ name: "euler_raw_get", arguments: { path: "/webcast/gifts" } });
assert.ok(textOf(r).includes('"gifts"'));
r = await client.callTool({ name: "euler_raw_get", arguments: { path: "/webcast/big" } });
assert.ok(textOf(r).includes("[truncated") && textOf(r).length < 26_000);
await client.close();

// wrong key -> readable 401
const bad = await connect("euler_WRONG");
r = await bad.callTool({ name: "euler_get_account", arguments: {} });
assert.equal(r.isError, true); assert.ok(textOf(r).includes("EULER_API_KEY"));
await bad.close();

mock.close();
console.error("Smoke test passed (mock upstream, not the real Euler API)");
