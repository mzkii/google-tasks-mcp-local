import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getConfigDir, getProfile, runAuth, writeSecureFile } from "./auth.ts";

export const USAGE = `使い方:
  node build/index.js                                  MCP サーバーとして起動（stdio）
  node build/index.js setup [client_secret.json] [オプション]
                                                       認証情報を配置して認可まで実行
                                                       （パス省略時は ~/Downloads の最新の client_secret_*.json）
  node build/index.js auth [オプション]                認可のやり直し（credentials.json 配置済み）
  node build/index.js help                             この表示

オプション:
  --profile <名前>   プロファイル名（GOOGLE_TASKS_PROFILE より優先）
  --readonly         読み取り専用（GOOGLE_TASKS_READONLY=1 と同じ）
`;

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
      if (!value) throw new UsageError("--profile に名前を指定してください");
      parsed.profile = value;
    } else if (arg === "--readonly") {
      parsed.readonly = true;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`未知のオプションです: ${arg}`);
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
    throw new Error(`ファイルを読み込めません: ${path}`);
  }
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`JSON として読み込めません: ${path}`);
  }
  if (json?.installed?.client_id && json?.installed?.client_secret) return json;
  if (json && typeof json === "object" && "web" in json) {
    throw new Error("ウェブアプリ型です。種類『デスクトップアプリ』で作り直してください");
  }
  throw new Error(
    `形式が不正です（"installed" に client_id / client_secret が必要。種類『デスクトップアプリ』の OAuth クライアント JSON を指定してください）: ${path}`
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatRegistration(
  profile: string,
  readonly: boolean,
  scriptPath: string
): string {
  const name = profile === "default" ? "google-tasks" : `google-tasks-${profile}`;
  const env: Record<string, string> = {};
  if (profile !== "default") env.GOOGLE_TASKS_PROFILE = profile;
  if (readonly) env.GOOGLE_TASKS_READONLY = "1";

  const envFlags = Object.entries(env).map(([k, v]) => ` -e ${k}=${v}`).join("");
  const command = `claude mcp add ${name} -s user${envFlags} -- node ${shellQuote(scriptPath)}`;

  const entry: Record<string, unknown> = { command: "node", args: [scriptPath] };
  if (Object.keys(env).length > 0) entry.env = env;
  const desktop = JSON.stringify({ mcpServers: { [name]: entry } }, null, 2);

  return `Claude Code に登録するには、次のコマンドを実行してください:

${command}

Claude Desktop の場合は claude_desktop_config.json に次を追加してください:

${desktop}
`;
}

// ~/Downloads から最新の client_secret_*.json を探す
async function findDownloadedClientJson(): Promise<string> {
  const dir = join(homedir(), "Downloads");
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (n) => n.startsWith("client_secret_") && n.endsWith(".json")
  );
  if (names.length === 0) {
    throw new UsageError(
      `${dir} に client_secret_*.json が見つかりません。パスを指定してください`
    );
  }
  const withTime = await Promise.all(
    names.map(async (n) => ({ path: join(dir, n), mtime: (await stat(join(dir, n))).mtimeMs }))
  );
  return withTime.sort((a, b) => b.mtime - a.mtime)[0].path;
}

export async function runAuthCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.positional.length > 0) throw new UsageError("引数が多すぎます");
  applyOptions(parsed);
  await runAuth();
}

export async function runSetup(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.positional.length > 1) {
    throw new UsageError("client_secret.json のパスは 1 つだけ指定してください");
  }
  applyOptions(parsed);
  const profile = getProfile();

  const source = parsed.positional[0]
    ? resolve(parsed.positional[0])
    : await findDownloadedClientJson();
  console.error(`使用する JSON: ${source}`);
  const json = await loadClientJson(source);

  const target = join(getConfigDir(), "credentials.json");
  if (existsSync(target)) {
    console.error(`既存の credentials.json を上書きします: ${target}`);
  }
  await writeSecureFile("credentials.json", JSON.stringify(json, null, 2));
  console.error(`credentials.json を配置しました: ${target}\n`);

  await runAuth();

  console.error(
    "\n" +
      formatRegistration(
        profile,
        process.env.GOOGLE_TASKS_READONLY === "1",
        resolve(process.argv[1])
      )
  );
}

export function isUsageError(error: unknown): boolean {
  return error instanceof UsageError;
}
