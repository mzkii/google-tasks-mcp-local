# google-tasks-mcp-local

Google Tasks 用の MCP サーバー（ローカル stdio 型）。Claude Code / Claude Desktop から子プロセスとして起動され、自分のマシンと Google Tasks API だけで完結します。

## 特徴

- ローカル完結。中継サーバー・自前の公開エンドポイントは一切なし
- 保存するデータは `token.json`（アクセス/リフレッシュトークン）のみ。タスクの内容は保存しない
- ランタイム依存は `@modelcontextprotocol/sdk` と `zod` のみ（Google API は fetch で直接呼び出し）
- スコープ: `https://www.googleapis.com/auth/tasks`（`GOOGLE_TASKS_READONLY=1` なら `tasks.readonly`）
- プロファイルで複数アカウント（個人・会社など）を切り替え可能

## データフロー

```
Claude Code / Desktop
   │ stdio (JSON-RPC)
   ▼
google-tasks-mcp-local (ローカルプロセス)
   │ HTTPS (Bearer access_token)
   ▼
tasks.googleapis.com / oauth2.googleapis.com

保存先: ${XDG_CONFIG_HOME:-~/.config}/google-tasks-mcp-local/<profile>/
  credentials.json  OAuth クライアント（ユーザーが配置）
  token.json        トークン（0600、ディレクトリ 0700）
```

## セットアップ

1. GCP プロジェクトで **Google Tasks API** を有効化
2. OAuth 同意画面を設定
   - 個人: User Type は External。公開ステータスを「本番」にすることを推奨（Testing のままだと refresh token が 7 日で失効）
   - 会社: Workspace の GCP プロジェクトで **Internal**
3. 「認証情報」で OAuth クライアント ID を作成（種類は **デスクトップアプリ**）し、JSON をダウンロード
4. JSON を `credentials.json` として配置
   ```
   mkdir -p ~/.config/google-tasks-mcp-local/work
   mv ~/Downloads/client_secret_*.json ~/.config/google-tasks-mcp-local/work/credentials.json
   ```
5. ビルドと認可
   ```
   npm install && npm run build
   GOOGLE_TASKS_PROFILE=work node build/index.js auth
   ```
   表示された URL（macOS ではブラウザも自動で開く）で認可すると `token.json` が保存されます。

## 登録

Claude Code:

```
claude mcp add google-tasks -s user -- node /path/to/build/index.js
claude mcp add google-tasks-work -s user -e GOOGLE_TASKS_PROFILE=work -- node /path/to/build/index.js
```

Claude Desktop（`claude_desktop_config.json`）:

```json
{
  "mcpServers": {
    "google-tasks-work": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": { "GOOGLE_TASKS_PROFILE": "work" }
    }
  }
}
```

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GOOGLE_TASKS_PROFILE` | `default` | プロファイル名（`^[a-zA-Z0-9_-]+$`） |
| `GOOGLE_TASKS_READONLY` | 未設定 | `1` で読み取り系 4 ツールのみ登録し、`tasks.readonly` スコープで認可 |
| `XDG_CONFIG_HOME` | `~/.config` | 設定ディレクトリの基点 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`（ログは stderr） |

読み取り専用に切り替える場合は、`GOOGLE_TASKS_READONLY=1` で `auth` を実行し直してください。

## ツール

- タスクリスト: `list_task_lists`, `get_task_list`, `insert_task_list`, `update_task_list`, `patch_task_list`, `delete_task_list`
- タスク: `list_tasks`, `get_task`, `insert_task`, `update_task`, `patch_task`, `delete_task`, `clear_completed_tasks`, `move_task`

読み取り専用モードで有効なのは `list_task_lists`, `get_task_list`, `list_tasks`, `get_task`。

## トークンの失効

- https://myaccount.google.com/permissions で本アプリのアクセスを削除
- ローカルの `token.json` を削除

## 謝辞

[akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) のフォークです。ライセンスは MIT（`LICENSE` 参照）。
