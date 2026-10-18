# CLAUDE.md

## 概要

Google Tasks 用のローカル stdio 型 MCP サーバー。外部サーバーなし、データは「ローカル ↔ Google Tasks API」で完結。コードは小さく読みやすく保つ（情シス審査を想定）。ランタイム依存は `@modelcontextprotocol/sdk` と `zod` のみ。依存を増やさない。

## コマンド

- ビルド: `npm run build`（tsc。`npm install` 時も prepare で自動実行）
- 起動: `npm start`（stdio）
- セットアップ: `npm run setup -- [client_secret.json] [--profile <p>] [--readonly]`（パス省略時は ~/Downloads の最新 client_secret_*.json。無ければ作成手順を表示しブラウザを開いて、新しい JSON のダウンロードを最大 15 分待つ。JSON 検証・配置 → 認可 → TTY かつ `claude` があれば登録を確認して実行、なければ登録コマンドを表示。Claude Desktop 用 JSON は常に表示）
- 再認可: `npm run auth -- [--profile <p>] [--readonly]`
- npm には公開しない（`private: true`）

テストフレームワークなし。stdio に JSON-RPC を流して確認する。

## 構成

- `src/index.ts` — エントリ。引数なしで stdio サーバー起動、`setup` / `auth` / `help` サブコマンド
- `src/setup.ts` — `setup` / `auth` の引数パース、client JSON 検証、Downloads 待機、Claude Code 登録
- `src/auth.ts` — プロファイル/保存先、ループバック OAuth（PKCE）、トークン更新。`credentials.json` と `token.json` を `${XDG_CONFIG_HOME:-~/.config}/google-tasks-mcp-local/<profile>/` に置く
- `src/google/api.ts` — Tasks REST の薄いラッパ（fetch）。204 は `{ success: true }`
- `src/tools/` — 14 ツール。`GOOGLE_TASKS_READONLY=1` では読み取り系 4 つのみ登録。`GOOGLE_TASKS_TOOLS`（カンマ区切り）で登録するツールを絞れる。未知の名前や READONLY との矛盾は起動時エラー（`tools/index.ts`）
- `src/utils/` — logger（stderr 専用、リダクション付き）、timestamp、i18n（`t(ja, en)`。CLI メッセージは日英併記、ロケールで切替）、allowlist（`GOOGLE_TASKS_ALLOWED_LISTS` のタスクリスト ID 以外へのアクセスを Google 呼び出し前に拒否）
- `automation/` — Slack → Google Tasks の定期実行（macOS launchd + `claude -p`）。`run.sh`（プロンプト展開・MCP 設定生成・実行）、`install.sh`（plist 生成と登録）、`github-data.mjs`（`GITHUB_OWNER` 設定時に読み取り専用 gh で PR/issue を取得、モデルには GitHub ツールを渡さない）、`prompt.md`、`config.example.env`。個人設定はリポジトリ外に置く。`DRY_RUN=1` で副作用なしに確認できる

## 規約

- stdout は MCP プロトコル専用。ログ・メッセージは必ず stderr（`console.error`）
- トークン・シークレットをログに出さない
- `.ts` 拡張子で import（`rewriteRelativeImportExtensions`）、`nodenext`
- タスクリスト ID を受け取るツールは、引数名を必ず `taskListId` にする（allowlist がこの名前で検査する）
- token.json はディレクトリ 0700 / ファイル 0600
