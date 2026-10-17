---
title: プライバシーポリシー / Privacy Policy
---

# プライバシーポリシー

google-tasks-mcp-local（以下「本アプリ」）は、利用者自身のコンピューター上で動作するオープンソースのソフトウェアです。

## 取得する情報

本アプリは、Google Tasks API を通じて、利用者が許可した Google アカウントの Google Tasks のデータ（タスクリストとタスク）にアクセスします。要求するスコープは `https://www.googleapis.com/auth/tasks` です。読み取り専用モードでは `https://www.googleapis.com/auth/tasks.readonly` を要求します。

## 利用目的

取得したデータは、利用者の指示に従って、MCP クライアント（Claude Code など）からタスクを表示・追加・更新・削除するためだけに使用します。

## 保存と送信

- 本アプリの開発者が運営するサーバーはありません。データは利用者のコンピューターと Google の API の間でのみ送受信されます。
- 利用者のコンピューターに保存するのは OAuth のトークン（`~/.config/google-tasks-mcp-local/` 内、利用者本人のみ読み書き可）だけです。タスクの内容は保存しません。
- 開発者を含む第三者へ、データを送信・共有・販売することはありません。
- 取得したデータを、MCP クライアントに渡す以外の目的（広告、AI モデルの学習を含む）には使用しません。MCP クライアントに渡されたデータは、そのクライアントのポリシーに従って扱われます。

## Google API サービスのユーザーデータに関するポリシー

本アプリは、Google API から取得した情報を、[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)（Limited Use の要件を含む）に従って使用します。

## アクセスの取り消し

[Google アカウントの「サードパーティ製のアプリとサービス」](https://myaccount.google.com/permissions) からいつでもアクセスを取り消せます。あわせて `~/.config/google-tasks-mcp-local/` を削除すると、保存されたトークンも消えます。

## お問い合わせ

<https://github.com/mzkii/google-tasks-mcp-local/issues>

---

# Privacy Policy (English)

google-tasks-mcp-local is open-source software that runs entirely on the user's own computer.

- It accesses the user's Google Tasks data (task lists and tasks) through the Google Tasks API, only with the user's consent, using the `tasks` (or `tasks.readonly`) scope.
- The data is used only to view, create, update and delete tasks as instructed by the user through an MCP client such as Claude Code.
- There is no server operated by the developer. Data travels only between the user's computer and Google's APIs. Only OAuth tokens are stored locally (readable by the user only); task contents are not stored.
- No data is sent to, shared with, or sold to the developer or any third party, and it is not used for advertising or for training AI models.
- Use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.
- Access can be revoked at any time at <https://myaccount.google.com/permissions>.
- Contact: <https://github.com/mzkii/google-tasks-mcp-local/issues>
