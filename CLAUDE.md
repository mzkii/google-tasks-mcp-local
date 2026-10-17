# CLAUDE.md

## 概要

Google Tasks 用のローカル stdio 型 MCP サーバー。外部サーバーなし、データは「ローカル ↔ Google Tasks API」で完結。コードは小さく読みやすく保つ（情シス審査を想定）。ランタイム依存は `@modelcontextprotocol/sdk` と `zod` のみ。依存を増やさない。

## コマンド

- ビルド: `npm run build`（tsc）
- 起動: `npm start`（stdio）
- セットアップ: `node build/index.js setup <client_secret.json> [--profile <p>] [--readonly]`（JSON 検証・配置 → 認可 → 登録コマンド表示。登録は実行しない）
- 再認可: `node build/index.js auth [--profile <p>] [--readonly]`

テストフレームワークなし。stdio に JSON-RPC を流して確認する。

## 構成

- `src/index.ts` — エントリ。引数なしで stdio サーバー起動、`setup` / `auth` / `help` サブコマンド
- `src/setup.ts` — `setup` / `auth` の引数パース、client JSON 検証、登録コマンド整形
- `src/auth.ts` — プロファイル/保存先、ループバック OAuth（PKCE）、トークン更新。`credentials.json` と `token.json` を `${XDG_CONFIG_HOME:-~/.config}/google-tasks-mcp-local/<profile>/` に置く
- `src/google/api.ts` — Tasks REST の薄いラッパ（fetch）。204 は `{ success: true }`
- `src/tools/` — 14 ツール。`GOOGLE_TASKS_READONLY=1` では読み取り系 4 つのみ登録（`tools/index.ts`）
- `src/utils/` — logger（stderr 専用、リダクション付き）、timestamp

## 規約

- stdout は MCP プロトコル専用。ログ・メッセージは必ず stderr（`console.error`）
- トークン・シークレットをログに出さない
- `.ts` 拡張子で import（`rewriteRelativeImportExtensions`）、`nodenext`
- token.json はディレクトリ 0700 / ファイル 0600
