// CI 用の動作確認: 認証情報なしで起動し、tools/list が 14 個（読み取り専用は 4 個）返ること、最小権限用の環境変数が効くことを確かめる
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function start(env) {
  return spawn("node", ["build/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "gtm-")), ...env },
  });
}

async function listTools(env) {
  const p = start(env);
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

// 起動に失敗する（終了コードが 0 以外）ことを確かめる
async function failsToStart(env) {
  const p = start(env);
  p.stderr?.resume();
  return new Promise((resolve) => {
    p.on("exit", (code) => resolve(code !== 0));
    setTimeout(() => { p.kill(); resolve(false); }, 5000);
  });
}

// 許可外のリスト ID でツールを呼ぶと、認証より前に拒否されることを確かめる
async function callDenied(env) {
  const p = start(env);
  const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_task_list", arguments: { taskListId: "other" } } });
  let buf = "";
  for await (const chunk of p.stdout) {
    buf += chunk;
    for (const line of buf.split("\n").slice(0, -1)) {
      const msg = JSON.parse(line);
      if (msg.id === 3) {
        p.kill();
        const text = msg.result.content[0].text;
        return msg.result.isError === true && /許可されていません|not allowed/.test(text);
      }
    }
    buf = buf.split("\n").pop();
  }
  return false;
}

const full = await listTools({});
const readonly = await listTools({ GOOGLE_TASKS_READONLY: "1" });
console.log(`tools: ${full}, readonly: ${readonly}`);
if (full !== 14 || readonly !== 4) process.exit(1);

const picked = await listTools({ GOOGLE_TASKS_TOOLS: "list_tasks, insert_task,patch_task" });
const unknownFails = await failsToStart({ GOOGLE_TASKS_TOOLS: "no_such_tool" });
const readonlyWriteFails = await failsToStart({ GOOGLE_TASKS_READONLY: "1", GOOGLE_TASKS_TOOLS: "insert_task" });
const denied = await callDenied({ GOOGLE_TASKS_ALLOWED_LISTS: "allowed1" });
console.log(`picked: ${picked}, unknown fails: ${unknownFails}, readonly+write fails: ${readonlyWriteFails}, denied: ${denied}`);
if (picked !== 3 || !unknownFails || !readonlyWriteFails || !denied) process.exit(1);
