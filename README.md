# google-tasks-mcp-local

Claude Code / Claude Desktop から Google Tasks を操作するための MCP サーバーです。自分の Mac の中だけで動きます。

- 外部サーバーなし。通信するのは自分の Mac と Google Tasks API だけ
- 保存するのはトークンだけ（`~/.config/google-tasks-mcp-local/`）。タスクの中身は保存しない
- 依存は `@modelcontextprotocol/sdk` と `zod` の 2 つだけ

## はじめかた

### 1. Google Cloud で鍵（OAuth クライアント）を作る

[Google Cloud Console](https://console.cloud.google.com/) で次の操作をします（5 分ほど）。

1. 新しいプロジェクトを作る
2. 「API とサービス」→「ライブラリ」→ **Google Tasks API** を有効にする
3. 「Google Auth Platform」→「開始」。アプリ名とメールを入力し、対象は **外部** を選ぶ
4. 「対象」→ 公開ステータスの **「アプリを公開」**（テストのままだと 7 日で認可が切れる）
5. 「クライアント」→「クライアントを作成」→ 種類 **デスクトップアプリ** → 作成して **JSON をダウンロード**

> 会社の Google Workspace アカウントで使う場合は、手順 3 で **内部** を選びます。内部を選ぶと、手順 4 の「アプリを公開」は不要です。会社の GCP を使ってよいかは事前に社内で確認してください。

### 2. インストールとセットアップ

```sh
git clone https://github.com/mzkii/google-tasks-mcp-local
cd google-tasks-mcp-local
npm install        # ビルドも自動で行われます
npm run setup      # ~/Downloads の client_secret_*.json を使います
```

ブラウザが開くので、Google アカウントでログインして許可してください。「Google はこのアプリを確認していません」と表示されたら「続行」を押します。

### 3. Claude Code に登録

セットアップの最後に、次のような登録コマンドが表示されます。それをコピーして実行し、Claude Code を再起動すれば完了です。

```sh
claude mcp add google-tasks -s user -- node '/path/to/google-tasks-mcp-local/build/index.js'
```

「Google Tasks のリストを見せて」「買い物リストに牛乳を追加して」のように話しかけると使えます。

## 会社用・読み取り専用

プロファイルを分けると、個人用と会社用を並べて使えます。`npm run` に引数を渡すときは `--` を挟みます。

```sh
npm run setup -- ~/Downloads/client_secret_xxx.json --profile work
npm run setup -- --profile work --readonly   # 読み取り専用（一覧・取得だけ）
```

登録コマンドは、プロファイルごとに表示されます（例: `google-tasks-work`）。

## 困ったとき

| 症状 | 対処 |
| --- | --- |
| Claude から「認可が必要です」と返ってくる | `npm run auth`（会社用は `npm run auth -- --profile work`）で認可し直す |
| `401 invalid_client` / `The OAuth client was not found` | クライアントを作った直後なら数分待つ。または JSON が古い・削除済み |
| `redirect_uri_mismatch` | 種類が「ウェブアプリ」になっている。「デスクトップアプリ」で作り直す |
| `access_denied` / 403 | アプリを公開していない（テスト中ならテストユーザーに追加する）、または組織のポリシーでブロックされている |
| 7 日ごとに認可が切れる | 「アプリを公開」してから `npm run auth` を実行する |

## やめるとき

```sh
claude mcp remove google-tasks -s user
rm -rf ~/.config/google-tasks-mcp-local
```

最後に、Google アカウントの [サードパーティ製のアプリとサービス](https://myaccount.google.com/permissions) からアクセスを削除します。

## しくみ

```
Claude Code ──stdio──▶ google-tasks-mcp-local（Mac 上のプロセス）──HTTPS──▶ Google Tasks API
                              │
                              └ ~/.config/google-tasks-mcp-local/<profile>/
                                   credentials.json  OAuth クライアント（0600）
                                   token.json        トークン（0600）
```

- 認可は、`127.0.0.1` で一時的に待ち受けるループバック OAuth です（PKCE と state で検証）。アクセストークンは期限が切れる前に自動で更新されます
- スコープは `https://www.googleapis.com/auth/tasks` です。`--readonly` を付けると `tasks.readonly` になります
- ログは stderr にだけ出力し、トークンは出力しません

<details>
<summary>コマンド・環境変数・ツール一覧</summary>

| コマンド | 説明 |
| --- | --- |
| `npm run setup -- [JSON] [--profile 名前] [--readonly]` | JSON を配置し、認可して、登録コマンドを表示する |
| `npm run auth -- [--profile 名前] [--readonly]` | 認可し直す |
| `node build/index.js` | MCP サーバーとして起動する（通常は Claude が自動で起動する） |

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GOOGLE_TASKS_PROFILE` | `default` | プロファイル名。`--profile` が優先される |
| `GOOGLE_TASKS_READONLY` | 未設定 | `1` にすると、読み取り系の 4 ツールだけを登録する |
| `XDG_CONFIG_HOME` | `~/.config` | 保存先の基点 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

ツール: `list_task_lists`, `get_task_list`, `insert_task_list`, `update_task_list`, `patch_task_list`, `delete_task_list`, `list_tasks`, `get_task`, `insert_task`, `update_task`, `patch_task`, `delete_task`, `clear_completed_tasks`, `move_task`（読み取り専用では先頭の `list_` / `get_` の 4 つだけ）

</details>

## ライセンス

MIT。[akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) をフォークしたものです。
