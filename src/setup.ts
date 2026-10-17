import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import {
  getConfigDir,
  getProfile,
  openBrowser,
  runAuth,
  writeSecureFile,
} from "./auth.ts";
import { t } from "./utils/i18n.ts";

const run = promisify(execFile);
const WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

export const USAGE = t(
  `使い方:
  node build/index.js                                  MCP サーバーとして起動（stdio）
  node build/index.js setup [client_secret.json] [オプション]
                                                       認証情報を配置して認可まで実行
                                                       （パス省略時は ~/Downloads の最新の client_secret_*.json。
                                                         無ければ作成手順を表示して、ダウンロードを待つ）
  node build/index.js auth [オプション]                認可のやり直し（credentials.json 配置済み）
  node build/index.js help                             この表示

オプション:
  --profile <名前>   プロファイル名（GOOGLE_TASKS_PROFILE より優先）
  --readonly         読み取り専用（GOOGLE_TASKS_READONLY=1 と同じ）
`,
  `Usage:
  node build/index.js                                  Start as an MCP server (stdio)
  node build/index.js setup [client_secret.json] [options]
                                                       Install credentials and run authorization
                                                       (without a path, uses the newest client_secret_*.json in
                                                         ~/Downloads; if none, shows the steps and waits for the download)
  node build/index.js auth [options]                   Re-run authorization (credentials.json already in place)
  node build/index.js help                             Show this help

Options:
  --profile <name>   Profile name (takes precedence over GOOGLE_TASKS_PROFILE)
  --readonly         Read-only mode (same as GOOGLE_TASKS_READONLY=1)
`
);

class UsageError extends Error {}

interface Parsed {
  positional: string[];
  profile?: string;
  readonly: boolean;
}

function parseArgs(args: string[]): Parsed {
  const parsed: Parsed = { positional: [], readonly: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--profile") {
      const value = args[++i];
      if (!value) throw new UsageError(t("--profile に名前を指定してください", "--profile requires a name"));
      parsed.profile = value;
    } else if (arg === "--readonly") {
      parsed.readonly = true;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`${t("未知のオプションです", "Unknown option")}: ${arg}`);
    } else {
      parsed.positional.push(arg);
    }
  }
  return parsed;
}

function applyOptions({ profile, readonly }: Parsed) {
  if (profile) process.env.GOOGLE_TASKS_PROFILE = profile;
  if (readonly) process.env.GOOGLE_TASKS_READONLY = "1";
}

async function loadClientJson(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`${t("ファイルを読み込めません", "Cannot read file")}: ${path}`);
  }
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${t("JSON として読み込めません", "Not valid JSON")}: ${path}`);
  }
  if (json?.installed?.client_id && json?.installed?.client_secret) return json;
  if (json && typeof json === "object" && "web" in json) {
    throw new Error(
      t(
        "ウェブアプリ型です。種類『デスクトップアプリ』で作り直してください",
        'This is a "Web application" client. Recreate it with type "Desktop app"'
      )
    );
  }
  throw new Error(
    t(
      `形式が不正です（"installed" に client_id / client_secret が必要。種類『デスクトップアプリ』の OAuth クライアント JSON を指定してください）: ${path}`,
      `Invalid format ("installed" must contain client_id and client_secret; use a "Desktop app" OAuth client JSON): ${path}`
    )
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function registration(profile: string, readonly: boolean, scriptPath: string) {
  const name = profile === "default" ? "google-tasks" : `google-tasks-${profile}`;
  const env: Record<string, string> = {};
  if (profile !== "default") env.GOOGLE_TASKS_PROFILE = profile;
  if (readonly) env.GOOGLE_TASKS_READONLY = "1";
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const args = ["mcp", "add", name, "-s", "user", ...envArgs, "--", "node", scriptPath];
  return { name, env, args };
}

function formatRegistration(
  { name, env, args }: ReturnType<typeof registration>,
  scriptPath: string,
  showCommand: boolean
): string {
  const quoted = args.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : shellQuote(a)));
  const command = `claude ${quoted.join(" ")}`;

  const entry: Record<string, unknown> = { command: "node", args: [scriptPath] };
  if (Object.keys(env).length > 0) entry.env = env;
  const desktop = JSON.stringify({ mcpServers: { [name]: entry } }, null, 2);

  const code = showCommand
    ? `${t("Claude Code に登録するには、次のコマンドを実行してください:", "To register with Claude Code, run:")}\n\n${command}\n\n`
    : "";
  return `${code}${t(
    "Claude Desktop の場合は claude_desktop_config.json に次を追加してください:",
    "For Claude Desktop, add this to claude_desktop_config.json:"
  )}\n\n${desktop}\n`;
}

async function hasClaudeCommand(): Promise<boolean> {
  try {
    await run("claude", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return !/^n/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

// Claude Code への登録を試みる。登録したら true
async function tryRegister(args: string[]): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY || !(await hasClaudeCommand())) {
    return false;
  }
  if (!(await confirm(t("Claude Code に今すぐ登録しますか？ [Y/n] ", "Register with Claude Code now? [Y/n] ")))) {
    return false;
  }
  try {
    await run("claude", args);
    console.error(t("Claude Code に登録しました。", "Registered with Claude Code."));
    return true;
  } catch (error: any) {
    const output = String(error?.stderr || error?.stdout || error?.message || error).trim();
    console.error(`${t("登録に失敗しました", "Registration failed")}:\n${output}\n`);
    return false;
  }
}

const downloadsDir = () => join(homedir(), "Downloads");

// ~/Downloads の client_secret_*.json を新しい順に返す
async function listDownloadedClientJsons(): Promise<{ path: string; mtime: number }[]> {
  const dir = downloadsDir();
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (n) => n.startsWith("client_secret_") && n.endsWith(".json")
  );
  const files = await Promise.all(
    names.map(async (n) => {
      const path = join(dir, n);
      const mtime = await stat(path).then((s) => s.mtimeMs, () => 0);
      return { path, mtime };
    })
  );
  return files.sort((a, b) => b.mtime - a.mtime);
}

function printCreationSteps() {
  console.error(
    t(
      `~/Downloads に client_secret_*.json が見つかりません。OAuth クライアント（デスクトップアプリ）を作成してください:

  1. Google Cloud でプロジェクトを作成（または既存のものを選択）
  2. Google Tasks API を有効化
     https://console.cloud.google.com/apis/library/tasks.googleapis.com
  3. Google Auth Platform で「開始」→ 対象は「外部」→ 完了後「対象」→「アプリを公開」
     （公開しないとリフレッシュトークンが 7 日で失効します。公開にはアプリ名（"Google" を含めない）、
       ホームページと プライバシーポリシーの URL が必要です）
  4. 「クライアント」→「クライアントを作成」→ 種類「デスクトップアプリ」→ JSON をダウンロード
     https://console.cloud.google.com/auth/clients
`,
      `No client_secret_*.json found in ~/Downloads. Create an OAuth client (Desktop app):

  1. Create a project in Google Cloud (or pick an existing one)
  2. Enable the Google Tasks API
     https://console.cloud.google.com/apis/library/tasks.googleapis.com
  3. In Google Auth Platform: Get started -> Audience "External" -> then Audience -> Publish app
     (otherwise the refresh token expires in 7 days; publishing requires an app name WITHOUT the
       word "Google", plus a homepage URL and a privacy policy URL)
  4. Clients -> Create client -> type "Desktop app" -> download the JSON
     https://console.cloud.google.com/auth/clients
`
    )
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ~/Downloads の最新の client_secret_*.json を返す。無ければ手順を表示して新規ダウンロードを待つ
async function findDownloadedClientJson(): Promise<string> {
  const existing = await listDownloadedClientJsons();
  if (existing.length > 0) return existing[0].path;

  printCreationSteps();
  openBrowser("https://console.cloud.google.com/");
  console.error(t("待機中… (Ctrl+C でキャンセル)", "waiting… (Ctrl+C to cancel)"));
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const found = (await listDownloadedClientJsons()).find((f) => f.mtime > startedAt);
    if (found) return found.path;
  }
  throw new UsageError(
    t(
      `${downloadsDir()} に client_secret_*.json が現れませんでした（15分）。パスを指定してください`,
      `No client_secret_*.json appeared in ${downloadsDir()} (15 minutes). Please specify the path`
    )
  );
}

export async function runAuthCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.positional.length > 0) throw new UsageError(t("引数が多すぎます", "Too many arguments"));
  applyOptions(parsed);
  await runAuth();
}

export async function runSetup(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.positional.length > 1) {
    throw new UsageError(t("client_secret.json のパスは 1 つだけ指定してください", "Specify only one client_secret.json path"));
  }
  applyOptions(parsed);
  const profile = getProfile();

  const source = parsed.positional[0]
    ? resolve(parsed.positional[0])
    : await findDownloadedClientJson();
  console.error(`${t("使用する JSON", "Using JSON")}: ${source}`);
  const json = await loadClientJson(source);

  const target = join(getConfigDir(), "credentials.json");
  if (existsSync(target)) {
    console.error(t(`既存の credentials.json を上書きします: ${target}`, `Overwriting existing credentials.json: ${target}`));
  }
  await writeSecureFile("credentials.json", JSON.stringify(json, null, 2));
  console.error(t(`credentials.json を配置しました: ${target}\n`, `Installed credentials.json: ${target}\n`));

  await runAuth();

  const scriptPath = resolve(process.argv[1]);
  const info = registration(profile, process.env.GOOGLE_TASKS_READONLY === "1", scriptPath);
  const registered = await tryRegister(info.args);
  console.error("\n" + formatRegistration(info, scriptPath, !registered));
}

export function isUsageError(error: unknown): boolean {
  return error instanceof UsageError;
}
