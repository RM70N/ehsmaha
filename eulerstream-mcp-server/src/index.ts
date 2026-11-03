#!/usr/bin/env node
/**
 * MCP server for the Euler Stream TikTok LIVE API.
 * Serves stdio by default, Streamable HTTP (localhost) when TRANSPORT=http.
 * Requires EULER_API_KEY. Optional: EULER_API_BASE, PORT.
 */
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

if (!process.env.EULER_API_KEY) {
  console.error("EULER_API_KEY environment variable is required (create one in the Euler Stream dashboard).");
  process.exit(1);
}

if (process.env.TRANSPORT === "http") {
  const handler = createMcpHandler(createServer);
  const app = createMcpExpressApp();
  const nodeHandler = toNodeHandler(handler);
  app.all("/mcp", (req, res) => void nodeHandler(req, res, req.body));
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, "127.0.0.1", () => console.error(`eulerstream-mcp-server listening on http://127.0.0.1:${port}/mcp`));
} else {
  serveStdio(createServer);
  console.error("eulerstream-mcp-server running on stdio");
}
