import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { t } from "./utils/i18n.ts";
import { createLogger } from "./utils/logger.ts";

const logger = createLogger({ component: "auth" });

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface Credentials {
  client_id: string;
  client_secret: string;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms
  scope: string;
}

export function isReadOnly(): boolean {
  return process.env.GOOGLE_TASKS_READONLY === "1";
}

function getScope(): string {
  return isReadOnly()
    ? "https://www.googleapis.com/auth/tasks.readonly"
    : "https://www.googleapis.com/auth/tasks";
}

export function getProfile(): string {
  const profile = process.env.GOOGLE_TASKS_PROFILE || "default";
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) {
    throw new Error(
      t(
        `GOOGLE_TASKS_PROFILE の値が不正です（英数字・_・- のみ）: ${profile}`,
        `Invalid GOOGLE_TASKS_PROFILE (letters, digits, _ and - only): ${profile}`
      )
    );
  }
  return profile;
}

export function getConfigDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "google-tasks-mcp-local", getProfile());
}

function authHint(): string {
  const command = `GOOGLE_TASKS_PROFILE=${getProfile()} node ${process.argv[1]} auth`;
  return t(`${command} を実行してください。`, `Run: ${command}`);
}

async function loadCredentials(): Promise<Credentials> {
  const path = join(getConfigDir(), "credentials.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      t(
        `credentials.json が見つかりません。GCP で作成した「デスクトップアプリ」の OAuth クライアント JSON を次の場所に置いてください: ${path}`,
        `credentials.json not found. Place the "Desktop app" OAuth client JSON created in GCP at: ${path}`
      )
    );
  }
  const client = JSON.parse(raw)?.installed;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error(
      t(
        `credentials.json の形式が不正です（"installed" に client_id / client_secret が必要）: ${path}`,
        `Invalid credentials.json ("installed" must contain client_id and client_secret): ${path}`
      )
    );
  }
  return { client_id: client.client_id, client_secret: client.client_secret };
}

async function loadToken(): Promise<TokenData> {
  try {
    return JSON.parse(await readFile(join(getConfigDir(), "token.json"), "utf8"));
  } catch {
    throw new Error(`${t("認可が必要です。", "Authorization required.")} ${authHint()}`);
  }
}

export async function writeSecureFile(name: string, content: string): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const path = join(dir, name);
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function saveToken(token: TokenData): Promise<void> {
  await writeSecureFile("token.json", JSON.stringify(token, null, 2));
}

async function requestToken(params: Record<string, string>): Promise<any> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok) {
    // レスポンス本文にトークンは含まれないが、ログには status のみ出す
    logger.error("Token request failed", { status: response.status });
    throw new Error(t(`トークン取得に失敗しました (${response.status})`, `Failed to obtain token (${response.status})`));
  }
  return response.json();
}

export async function getValidAccessToken(): Promise<string> {
  const token = await loadToken();
  if (Date.now() < token.expires_at - 60_000) {
    return token.access_token;
  }

  logger.info("Access token expired, refreshing");
  const { client_id, client_secret } = await loadCredentials();
  let data: any;
  try {
    data = await requestToken({
      client_id,
      client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
  } catch {
    throw new Error(`${t("トークンの更新に失敗しました。", "Failed to refresh the token.")} ${authHint()}`);
  }

  const updated: TokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? token.scope,
  };
  await saveToken(updated);
  return updated.access_token;
}

// シェルを介さずブラウザを開く。失敗しても URL 表示で続行
export function openBrowser(url: string) {
  if (process.platform === "darwin") execFile("open", [url], () => {});
  else if (process.platform === "linux") execFile("xdg-open", [url], () => {});
  else if (process.platform === "win32") {
    execFile("rundll32", ["url.dll,FileProtocolHandler", url], () => {});
  }
}

export async function runAuth(): Promise<void> {
  const { client_id, client_secret } = await loadCredentials();

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  const code = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
      let redirectUri = "";
      const timer = setTimeout(() => {
        server.close();
        reject(new Error(t("認可がタイムアウトしました（5分）", "Authorization timed out (5 minutes)")));
      }, AUTH_TIMEOUT_MS);

      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/" && url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get("error");
        const received = url.searchParams.get("code");
        if (error || !received || url.searchParams.get("state") !== state) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(t("認可に失敗しました。", "Authorization failed."));
          clearTimeout(timer);
          server.close();
          reject(
            new Error(
              t(
                `認可に失敗しました: ${error ?? "state 不一致または code なし"}`,
                `Authorization failed: ${error ?? "state mismatch or missing code"}`
              )
            )
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(t("完了しました。このタブは閉じてください", "Done. You can close this tab."));
        clearTimeout(timer);
        server.close();
        resolve({ code: received, redirectUri });
      });

      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        redirectUri = `http://127.0.0.1:${port}`;
        const authUrl = `${AUTH_URL}?${new URLSearchParams({
          client_id,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: getScope(),
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          access_type: "offline",
          prompt: "consent",
        })}`;
        console.error(
          `${t("ブラウザで次の URL を開いて認可してください:", "Open this URL in your browser to authorize:")}\n${authUrl}\n`
        );
        openBrowser(authUrl);
      });
    }
  );

  const data = await requestToken({
    client_id,
    client_secret,
    code: code.code,
    code_verifier: verifier,
    redirect_uri: code.redirectUri,
    grant_type: "authorization_code",
  });
  if (!data.refresh_token) {
    throw new Error(t("refresh_token が取得できませんでした。再度 auth を実行してください", "No refresh_token was returned. Run auth again"));
  }

  await saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? getScope(),
  });
  console.error(
    t(
      `認可が完了しました。token.json を保存しました: ${join(getConfigDir(), "token.json")}`,
      `Authorization complete. Saved token.json: ${join(getConfigDir(), "token.json")}`
    )
  );
}
