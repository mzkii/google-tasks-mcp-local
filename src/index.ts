#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isReadOnly } from "./auth.ts";
import { USAGE, isUsageError, runAuthCommand, runSetup } from "./setup.ts";
import { registerAllTools } from "./tools/index.ts";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "setup") return runSetup(args);
  if (command === "auth") return runAuthCommand(args);
  if (command === "help" || command === "--help" || command === "-h") {
    console.error(USAGE);
    return;
  }
  if (command !== undefined) {
    console.error(`未知のコマンドです: ${command}\n\n${USAGE}`);
    process.exit(1);
  }

  const server = new McpServer({ name: "google-tasks-mcp-local", version: "2.0.0" });
  registerAllTools(server, isReadOnly());
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (isUsageError(error)) console.error(`\n${USAGE}`);
  process.exit(1);
});
