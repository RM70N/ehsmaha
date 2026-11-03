import { CHARACTER_LIMIT, DEFAULT_API_BASE, REQUEST_TIMEOUT_MS } from "./constants.js";

export function apiBase(): string {
  return (process.env.EULER_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function httpErrorMessage(status: number, detail: string, retryAfter: string | null): string {
  const tail = detail ? ` Server said: ${detail}` : "";
  switch (status) {
    case 400:
      return `Euler rejected the request parameters (400). Check the argument formats.${tail}`;
    case 401:
      return `Euler rejected the API key (401). Check that EULER_API_KEY is complete, active, and has no spaces or quotes.${tail}`;
    case 402:
    case 403:
      return `This API key's plan cannot use that endpoint (${status}). Check the plan in the Euler dashboard.${tail}`;
    case 404:
      return `Not found (404). Check the username/room ID; use euler_get_room_id to resolve a username.${tail}`;
    case 429:
      return `Rate limit exceeded (429).${retryAfter ? ` Retry after ${retryAfter}s.` : " Wait a minute."} Use euler_get_rate_limits to see the remaining quota.${tail}`;
    default:
      return `Euler API returned HTTP ${status}.${tail}`;
  }
}

export type Query = Record<string, string | number | boolean | undefined>;

export async function apiRequest(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Query; body?: unknown; signal: AbortSignal }
): Promise<unknown> {
  const apiKey = process.env.EULER_API_KEY;
  if (!apiKey) throw new Error("EULER_API_KEY is not set. Set it in the MCP server's environment.");
  const url = new URL(apiBase() + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { "x-api-key": apiKey, Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Euler did not respond within 30 seconds. Try again shortly.");
    }
    throw new Error(`Could not reach Euler at ${apiBase()}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const detail = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : String(text).slice(0, 200);
    throw new ApiError(res.status, httpErrorMessage(res.status, detail, res.headers.get("retry-after")));
  }
  return data;
}

// Masks anything that looks like a credential before it reaches the model.
const SECRET_KEY_RE = /(^|_)(key|secret|token|password)s?$|api_?key|webhook_secret/i;
export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === "string" && SECRET_KEY_RE.test(k) && v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : maskSecrets(v)
      ])
    );
  }
  return value;
}

export function textResult(data: unknown, hint = "narrow the request") {
  let text = JSON.stringify(maskSecrets(data), null, 2) ?? "null";
  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + `\n… [truncated: response was ${text.length} characters; ${hint}]`;
  }
  return { content: [{ type: "text" as const, text }] };
}
