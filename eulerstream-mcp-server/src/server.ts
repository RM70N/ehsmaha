import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { apiRequest, textResult } from "./api.js";
import { RANK_TYPES, RATE_LIMIT_TYPES, RAW_GET_PREFIXES, REGIONS } from "./constants.js";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const uniqueId = z.string().min(1).max(64).regex(/^@?[\w.]+$/, "TikTok usernames contain letters, digits, '_' and '.'")
  .transform(s => s.replace(/^@/, "")).describe("TikTok username (unique_id) with or without '@', e.g. 'tv_asahi_news'");
const region = z.enum(REGIONS).describe("Proxy region code, e.g. 'US', 'DE', 'SG'");

async function accountIdOf(explicit: number | undefined, signal: AbortSignal): Promise<number> {
  if (explicit !== undefined) return explicit;
  const me = (await apiRequest("GET", "/accounts/me", { signal })) as { account?: { id?: number } };
  const id = me.account?.id;
  if (typeof id !== "number") throw new Error("Could not determine the account ID from /accounts/me. Pass account_id explicitly.");
  return id;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "eulerstream-mcp-server", version: "1.0.0" });

  server.registerTool("euler_get_account", {
    title: "Get Account",
    description: "Get the Euler Stream account that owns the configured API key: plan limits (max websockets/alerts), expiry, permissions. Secrets are masked. Use first to confirm the key works.",
    inputSchema: z.strictObject({}),
    annotations: RO
  }, async (_a, ctx) => textResult(await apiRequest("GET", "/accounts/me", { signal: ctx.mcpReq.signal })));

  server.registerTool("euler_get_rate_limits", {
    title: "Get Rate Limits",
    description: "Show remaining Euler quota (per day / hour / minute) for the configured key, with reset times. Use to check whether a key is exhausted before blaming another cause. Optionally limit to one bucket type.",
    inputSchema: z.strictObject({
      type: z.enum(RATE_LIMIT_TYPES).optional().describe("Rate-limit bucket: WEBCAST (default behavior of the API), ALERTS, RATE_LIMITS or RANKINGS")
    }),
    annotations: RO
  }, async ({ type }, ctx) => textResult(await apiRequest("GET", "/accounts/me/rate_limits", { query: { type }, signal: ctx.mcpReq.signal })));

  server.registerTool("euler_list_api_keys", {
    title: "List API Keys",
    description: "List the API keys of the account (key values are masked to first 6 and last 4 characters). Use to see which keys exist, are active or expired. account_id defaults to the account of the configured key.",
    inputSchema: z.strictObject({ account_id: z.number().int().positive().optional().describe("Account ID; omit to use the current account") }),
    annotations: RO
  }, async ({ account_id }, ctx) => {
    const id = await accountIdOf(account_id, ctx.mcpReq.signal);
    return textResult(await apiRequest("GET", `/accounts/${id}/api_keys/list`, { signal: ctx.mcpReq.signal }));
  });

  server.registerTool("euler_get_room_id", {
    title: "Get Room ID",
    description: "Resolve a TikTok username to its current LIVE room ID, and whether the user is live. Use before tools that need a room_id (euler_get_room_gifts).\nExample: 'Is @someone live right now?' -> unique_id='someone'.",
    inputSchema: z.strictObject({ unique_id: uniqueId }),
    annotations: RO
  }, async ({ unique_id }, ctx) => textResult(await apiRequest("GET", `/webcast/anchors/${encodeURIComponent(unique_id)}/room_id`, { signal: ctx.mcpReq.signal })));

  server.registerTool("euler_get_room_info", {
    title: "Get Room Info",
    description: "Get live-room details for a TikTok user: status, title, current/total viewers, cover and stream URLs. Costs one request from the quota.",
    inputSchema: z.strictObject({ unique_id: uniqueId }),
    annotations: RO
  }, async ({ unique_id }, ctx) => textResult(await apiRequest("GET", `/webcast/anchors/${encodeURIComponent(unique_id)}/room_info`, { signal: ctx.mcpReq.signal }), "this is one room's info; use euler_raw_get with a narrower path"));

  server.registerTool("euler_get_user_id", {
    title: "Get User ID",
    description: "Resolve a TikTok username to the numeric user ID (needed by euler_check_live).",
    inputSchema: z.strictObject({ unique_id: uniqueId }),
    annotations: RO
  }, async ({ unique_id }, ctx) => textResult(await apiRequest("GET", `/webcast/anchors/${encodeURIComponent(unique_id)}/user_id`, { signal: ctx.mcpReq.signal })));

  server.registerTool("euler_check_live", {
    title: "Check Live (Bulk)",
    description: "Check which TikTok users are live right now, in one call. Takes numeric user IDs (get them from euler_get_user_id). Does not modify anything despite using POST.",
    inputSchema: z.strictObject({
      user_numeric_ids: z.array(z.string().regex(/^\d+$/, "numeric user IDs only")).min(1).max(100).describe("Numeric TikTok user IDs, 1-100")
    }),
    annotations: RO
  }, async ({ user_numeric_ids }, ctx) => textResult(await apiRequest("POST", "/webcast/bulk_live_check", { body: { user_numeric_ids }, signal: ctx.mcpReq.signal })));

  server.registerTool("euler_get_room_gifts", {
    title: "Get Room Gifts",
    description: "List the gifts available in a TikTok LIVE room (names, diamond prices, icons). Needs a room_id from euler_get_room_id.",
    inputSchema: z.strictObject({
      room_id: z.string().regex(/^\d+$/, "room IDs are numeric").describe("Numeric room ID"),
      webcast_language: z.string().regex(/^[a-z]{2}$/).default("en").describe("Two-letter language code for gift names, e.g. 'en', 'ar'")
    }),
    annotations: RO
  }, async ({ room_id, webcast_language }, ctx) => textResult(await apiRequest("GET", `/webcast/rooms/${room_id}/gifts`, { query: { webcast_language }, signal: ctx.mcpReq.signal }), "ask for a narrower language/region"));

  server.registerTool("euler_list_gift_catalog", {
    title: "List Gift Catalog",
    description: "Browse the global TikTok gift catalog, paginated. Use euler_search_gift_catalog to find a gift by name.",
    inputSchema: z.strictObject({
      page_size: z.number().int().min(1).max(100).default(20).describe("Gifts per page"),
      page_number: z.number().int().min(1).default(1).describe("1-based page number"),
      order_by: z.enum(["price", "name"]).default("price").describe("Sort field"),
      ascending: z.boolean().default(false).describe("true for ascending order")
    }),
    annotations: RO
  }, async ({ page_size, page_number, order_by, ascending }, ctx) => textResult(await apiRequest("GET", "/webcast/gifts/catalog", { query: { pageSize: page_size, pageNumber: page_number, orderBy: order_by, ascending }, signal: ctx.mcpReq.signal }), "lower page_size"));

  server.registerTool("euler_search_gift_catalog", {
    title: "Search Gift Catalog",
    description: "Search the TikTok gift catalog by name. Example: 'How many diamonds is the Rose gift?' -> query='Rose'.",
    inputSchema: z.strictObject({ query: z.string().min(1).max(100).describe("Gift name or part of it") }),
    annotations: RO
  }, async ({ query }, ctx) => textResult(await apiRequest("POST", "/webcast/gifts/catalog/search", { query: { query }, signal: ctx.mcpReq.signal })));

  server.registerTool("euler_get_hashtags", {
    title: "Get LIVE Hashtags",
    description: "List TikTok LIVE hashtags and game categories as exposed by Euler.",
    inputSchema: z.strictObject({}),
    annotations: RO
  }, async (_a, ctx) => textResult(await apiRequest("GET", "/webcast/hashtags", { signal: ctx.mcpReq.signal }), "use euler_raw_get for a narrower query"));

  server.registerTool("euler_get_feed", {
    title: "Get LIVE Feed",
    description: "Get the TikTok LIVE discovery feed as seen from a region (rooms currently being promoted). Large; costs one request.",
    inputSchema: z.strictObject({ region }),
    annotations: RO
  }, async ({ region: r }, ctx) => textResult(await apiRequest("GET", "/webcast/feed", { query: { region: r }, signal: ctx.mcpReq.signal }), "pick a smaller region or inspect fewer rooms"));

  server.registerTool("euler_get_rankings", {
    title: "Get Rankings",
    description: "Get TikTok LIVE regional rankings (daily ranking or fans-team ranking) for a region.",
    inputSchema: z.strictObject({ region, rank_type: z.enum(RANK_TYPES).default("DAILY_RANK").describe("Ranking type") }),
    annotations: RO
  }, async ({ region: r, rank_type }, ctx) => textResult(await apiRequest("GET", "/webcast/rankings", { query: { region: r, rank_type }, signal: ctx.mcpReq.signal })));

  server.registerTool("euler_list_websockets", {
    title: "List Active WebSockets",
    description: "List the account's currently open Euler WebSocket connections (for checking concurrency against the plan limit). account_id defaults to the current account.",
    inputSchema: z.strictObject({ account_id: z.number().int().positive().optional().describe("Account ID; omit to use the current account") }),
    annotations: RO
  }, async ({ account_id }, ctx) => {
    const id = await accountIdOf(account_id, ctx.mcpReq.signal);
    return textResult(await apiRequest("GET", `/webcast/websockets/${id}`, { signal: ctx.mcpReq.signal }));
  });

  server.registerTool("euler_raw_get", {
    title: "Raw GET (read-only escape hatch)",
    description: `Call any other Euler GET endpoint not wrapped by a dedicated tool (e.g. /webcast/anchors/{unique_id}/room_video, /webcast/anchors/{unique_id}/gift_gallery, /webcast/gifts). Only paths starting with ${RAW_GET_PREFIXES.join(", ")} are allowed; only GET. Prefer the dedicated tools.`,
    inputSchema: z.strictObject({
      path: z.string().startsWith("/").max(300).describe("API path, e.g. '/webcast/gifts'"),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}).describe("Query-string parameters")
    }),
    annotations: RO
  }, async ({ path, query }, ctx) => {
    if (path.includes("..") || path.includes("//") || !RAW_GET_PREFIXES.some(p => path.startsWith(p))) {
      throw new Error(`Path not allowed. It must start with one of: ${RAW_GET_PREFIXES.join(", ")} and contain no '..'.`);
    }
    return textResult(await apiRequest("GET", path, { query, signal: ctx.mcpReq.signal }));
  });

  return server;
}
