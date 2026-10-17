// CI 用の動作確認: 認証情報なしで起動し、tools/list が 14 個（読み取り専用は 4 個）返ることを確かめる
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function listTools(env) {
  const p = spawn("node", ["build/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "gtm-")), ...env },
  });
  const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  let buf = "";
  for await (const chunk of p.stdout) {
    buf += chunk;
    for (const line of buf.split("\n").slice(0, -1)) {
      const msg = JSON.parse(line);
      if (msg.id === 2) { p.kill(); return msg.result.tools.length; }
    }
    buf = buf.split("\n").pop();
  }
  throw new Error("no tools/list response");
}

const full = await listTools({});
const readonly = await listTools({ GOOGLE_TASKS_READONLY: "1" });
console.log(`tools: ${full}, readonly: ${readonly}`);
if (full !== 14 || readonly !== 4) process.exit(1);
