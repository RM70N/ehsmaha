# eulerstream-mcp-server

MCP server for the [Euler Stream](https://www.eulerstream.com/) TikTok LIVE API. **Read-only**: 15 tools for account/quota checks, username→room resolution, live checks, gifts, feed, rankings.

## Run

```bash
npm install && npm run build
EULER_API_KEY=euler_xxx node dist/index.js          # stdio
EULER_API_KEY=euler_xxx TRANSPORT=http PORT=3000 node dist/index.js   # http://127.0.0.1:3000/mcp
```

Claude Code (stdio):

```bash
claude mcp add eulerstream --env EULER_API_KEY=euler_xxx -- node /absolute/path/eulerstream-mcp-server/dist/index.js
```

| Variable | Required | Meaning |
|---|---|---|
| `EULER_API_KEY` | yes | Your Euler API key (sent as `x-api-key`) |
| `EULER_API_BASE` | no | Default `https://tiktok.eulerstream.com` |
| `TRANSPORT` / `PORT` | no | `http` to serve Streamable HTTP on 127.0.0.1 |

## Tools

`euler_get_account`, `euler_get_rate_limits`, `euler_list_api_keys` (values masked), `euler_get_room_id`, `euler_get_room_info`, `euler_get_user_id`, `euler_check_live`, `euler_get_room_gifts`, `euler_list_gift_catalog`, `euler_search_gift_catalog`, `euler_get_hashtags`, `euler_get_feed`, `euler_get_rankings`, `euler_list_websockets`, `euler_raw_get` (GET only, `/webcast/`, `/accounts/me`, `/analytics/`).

Not included on purpose (they change state or need a TikTok session): moderation, chat sending, alerts/targets, key creation/deletion, OAuth.

Credential-like fields in responses (`key`, `secret`, `token`, …) are masked before reaching the model. Each request counts against your Euler quota.

## Verify

`npm run build && npm run smoke` runs a self-check against a **local mock** of the API (no network). Endpoints were derived from the official `tiktok-live-api-sdk` typings; they were **not** exercised against the live Euler service.
