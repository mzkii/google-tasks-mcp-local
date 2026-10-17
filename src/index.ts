#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isReadOnly, runAuth } from "./auth.ts";
import { registerAllTools } from "./tools/index.ts";

async function main() {
  if (process.argv[2] === "auth") {
    await runAuth();
    return;
  }

  const server = new McpServer({ name: "google-tasks-mcp", version: "2.0.0" });
  registerAllTools(server, isReadOnly());
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
