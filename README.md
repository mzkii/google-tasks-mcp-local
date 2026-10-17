# google-tasks-mcp-local

Google Tasks 用の MCP サーバー（ローカル stdio 型）。Claude Code / Claude Desktop から子プロセスとして起動され、自分のマシンと Google Tasks API だけで完結します。

- ローカル完結。中継サーバー・自前の公開エンドポイントは一切なし
- 保存するデータは `token.json`（アクセス/リフレッシュトークン）のみ。タスクの内容は保存しない
- ランタイム依存は `@modelcontextprotocol/sdk` と `zod` の 2 つだけ（Google API は fetch で直接呼び出し）
- プロファイルで複数アカウント（個人・会社など）を切り替え可能

## はじめかた

1. Google Cloud で OAuth クライアント（種類「デスクトップアプリ」）を作り、JSON をダウンロードする（手順は [Google Cloud の準備](#google-cloud-の準備)）
2. clone してビルド
   ```
   git clone https://github.com/mzkii/google-tasks-mcp-local && cd google-tasks-mcp-local && npm install && npm run build
   ```
3. セットアップ（JSON の配置とブラウザ認可）
   ```
   node build/index.js setup ~/Downloads/client_secret_xxx.json
   ```
   ブラウザで認可すると、最後に登録コマンドが表示されます。それを貼り付けて実行すれば完了です。

会社アカウントなど別アカウントを使う場合はプロファイルを指定します（必要なら `--readonly` で読み取り専用）。

```
node build/index.js setup ~/Downloads/client_secret_xxx.json --profile work
node build/index.js setup ~/Downloads/client_secret_xxx.json --profile work --readonly
```

## Google Cloud の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存を選択）
2. 「API とサービス」>「ライブラリ」で **Google Tasks API** を有効化
3. 「OAuth 同意画面」（Google Auth Platform）を設定
   - 個人: User Type は **External**。テストユーザーに自分のアカウントを追加するか、アプリを「本番」に公開する（Testing のままだと refresh token が 7 日で失効）
   - 会社: Workspace 組織の GCP プロジェクトで User Type **Internal**（社内限定・Google の審査不要・管理者が停止可能）。自分で作れない場合は情シスに依頼
4. 「クライアント」（「認証情報」）で OAuth クライアント ID を作成。種類は **デスクトップアプリ**
5. 作成後に JSON をダウンロード（`client_secret_xxx.json`）

### よくあるエラー

| エラー | 原因 |
| --- | --- |
| `401 invalid_client` / `The OAuth client was not found` | client_id の誤り、クライアントの削除済み、作成直後で未反映（数分待つ） |
| `redirect_uri_mismatch` | ウェブアプリ型で作っている。デスクトップアプリで作り直す |
| `access_denied` / 403 | テストユーザー未追加、または組織ポリシーでブロックされている |

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
  credentials.json  OAuth クライアント（setup が配置、0600）
  token.json        トークン（0600、ディレクトリ 0700）
```

スコープは `https://www.googleapis.com/auth/tasks`（読み取り専用なら `tasks.readonly`）。

## コマンドと環境変数

| コマンド | 説明 |
| --- | --- |
| `node build/index.js setup <client_secret.json> [--profile <名前>] [--readonly]` | JSON の検証・配置、ブラウザ認可、登録コマンドの表示 |
| `node build/index.js auth [--profile <名前>] [--readonly]` | 認可のやり直し（`credentials.json` 配置済み用） |
| `node build/index.js` | MCP サーバーとして起動（stdio）。通常は Claude から自動起動 |
| `node build/index.js help` | 使い方を表示 |

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GOOGLE_TASKS_PROFILE` | `default` | プロファイル名（`^[a-zA-Z0-9_-]+$`）。`--profile` が優先 |
| `GOOGLE_TASKS_READONLY` | 未設定 | `1` で読み取り系 4 ツールのみ登録し、`tasks.readonly` スコープで認可。`--readonly` と同じ |
| `XDG_CONFIG_HOME` | `~/.config` | 設定ディレクトリの基点 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`（ログは stderr） |

読み取り専用に切り替えるときは `--readonly` を付けて `setup` / `auth` を実行し直し、登録も `GOOGLE_TASKS_READONLY=1` 付きにしてください。

## ツール

- タスクリスト: `list_task_lists`, `get_task_list`, `insert_task_list`, `update_task_list`, `patch_task_list`, `delete_task_list`
- タスク: `list_tasks`, `get_task`, `insert_task`, `update_task`, `patch_task`, `delete_task`, `clear_completed_tasks`, `move_task`

読み取り専用モードで有効なのは `list_task_lists`, `get_task_list`, `list_tasks`, `get_task`。

## アンインストール・アクセスの失効

- 登録の削除: `claude mcp remove <名前> -s user`（名前は `google-tasks` / `google-tasks-<profile>`）
- Google 側のアクセス削除: https://myaccount.google.com/permissions
- ローカルデータの削除: `rm -rf ~/.config/google-tasks-mcp-local/<profile>`

## 謝辞

[akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) のフォークです。ライセンスは MIT（`LICENSE` 参照）。
