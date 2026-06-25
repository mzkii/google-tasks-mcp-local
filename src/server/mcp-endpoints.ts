import { Context } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { HonoSSETransport } from "../transport/mcp-transport.ts";
import { registerAllTools } from "../tools/index.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger({ component: "mcp-endpoints" });

export function handleMcpGet(c: Context) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const heartbeat = setInterval(() => {
    writer.write(encoder.encode(": ping\n\n")).catch(() => {
      clearInterval(heartbeat);
    });
  }, 15000);

  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    writer.close().catch(() => {});
  });

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  };

  return new Response(readable, { headers });
}

export async function handleMcpPost(c: Context) {
  const mcpToken = c.get("mcpToken") as string;

  let message: JSONRPCMessage;
  try {
    message = await c.req.json() as JSONRPCMessage;
  } catch {
    logger.error("Failed to parse incoming MCP message");
    return c.json({
      error: "invalid_request",
      error_description: "Request body is not valid JSON",
    }, 400);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let streamClosed = false;

  const closeStream = () => {
    if (streamClosed) {
      return;
    }
    streamClosed = true;
    writer.close().catch(() => {});
  };

  const writeSSE = async (data: string, event?: string) => {
    if (streamClosed) {
      return;
    }
    try {
      if (event) {
        await writer.write(encoder.encode(`event: ${event}\n`));
      }
      await writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch {
    }
  };

  const transport = new HonoSSETransport();
  transport.attachStream({
    writeSSE: async (data: { data: string; event?: string; id?: string }) => {
      await writeSSE(data.data, data.event);
      closeStream();
    },
    close: () => {
      closeStream();
    },
  });

  (async () => {
    try {
      const sessionServer = new McpServer(
        {
          name: "google-tasks-mcp",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      registerAllTools(sessionServer, mcpToken);

      await sessionServer.connect(transport);
      logger.info("MCP request handled statelessly via POST");

      await transport.handleIncomingMessage(message);

      setTimeout(() => {
        closeStream();
      }, 1000);
    } catch {
      logger.error("Failed to handle MCP message via POST");
      closeStream();
    }
  })();

  c.req.raw.signal.addEventListener("abort", () => {
    closeStream();
  });

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  };

  return new Response(readable, { headers });
}
