<p align="center">
  <img src="docs/images/hero.svg" alt="google-tasks-mcp-local: Claude ↔ local MCP server ↔ Google Tasks API" width="100%">
</p>

<p align="center">
  <b>English</b> · <a href="README.ja.md">日本語</a>
</p>

# google-tasks-mcp-local

An MCP server that lets Claude Code and Claude Desktop read and manage your Google Tasks. It runs entirely on your own machine.

There is no hosted server: traffic goes only between your machine and the Google Tasks API. You use your own OAuth client, and only the token is stored (`~/.config/google-tasks-mcp-local/`, mode 0600). Task contents are never saved.

It is tiny, with just two runtime dependencies (`@modelcontextprotocol/sdk` and `zod`), so it is easy to audit before your IT team approves it. It supports separate personal and work profiles, and has a read-only mode.

<p align="center">
  <img src="docs/images/demo-en.svg" alt="Asking Claude Code for today's tasks and adding one" width="90%">
</p>

## Quick start

Requires Node.js 20+.

```sh
git clone https://github.com/mzkii/google-tasks-mcp-local
cd google-tasks-mcp-local
npm install
npm run setup
```

`npm run setup` walks you through everything:

1. To create an OAuth client, it opens Google Cloud Console and shows the steps (about 5 minutes; details below). When you download the JSON, setup picks it up from `~/Downloads` automatically
2. To authorize, a browser opens. Sign in and allow access
3. Answer `Y` and it registers the server by running `claude mcp add` for you (the Claude Desktop config snippet is printed too)

Restart Claude Code and try: *"Show my Google Tasks lists"* or *"Add 'Buy milk' to my groceries list"*.

### Creating the OAuth client (Google Cloud Console)

1. Create a new project
2. Enable the [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com)
3. Go to "Google Auth Platform" → "Get started", enter an app name and email, and choose the "External" audience
4. Go to "Audience" → "Publish app" (otherwise **the authorization expires every 7 days**). To publish, the app name must not contain "Google", and you need a homepage URL and a privacy policy URL (any pages you control, such as GitHub Pages; [this repo's `docs/`](docs/) is an example)
5. Go to ["Clients" → "Create client"](https://console.cloud.google.com/auth/clients), choose the "Desktop app" type, and download the JSON

When you authorize, Google shows "Google hasn't verified this app". Since it is your own client, click "Advanced" → "Go to (app name) (unsafe)".

> If you use a Google Workspace (work) account, ask your admin to create the client in your company's GCP with the "Internal" audience. Internal apps need no publishing and show no warning.

## Work account / read-only

Profiles let you use personal and work accounts side by side. Pass arguments after `--`.

```sh
npm run setup -- --profile work                # registered as "google-tasks-work"
npm run setup -- --profile work --readonly     # list/get tools only
npm run setup -- ~/path/to/client_secret.json  # use a specific JSON
```

## Unattended / automation use

When a scheduled job reads untrusted text such as Slack messages, that text can try to steer the AI. Register only the tools and lists the job needs, so a hijacked run can do little harm. The list ID is the `id` returned by `list_task_lists`.

```sh
claude mcp add google-tasks-side -s user -e GOOGLE_TASKS_TOOLS=list_tasks,insert_task,patch_task -e GOOGLE_TASKS_ALLOWED_LISTS=<list id> -- node /path/to/build/index.js
```

The same setup for Claude Desktop:

```json
{
  "mcpServers": {
    "google-tasks-side": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "GOOGLE_TASKS_TOOLS": "list_tasks,insert_task,patch_task",
        "GOOGLE_TASKS_ALLOWED_LISTS": "<list id>"
      }
    }
  }
}
```

### Slack to Google Tasks sync

The `automation/` directory has a generic macOS job that reads your recent Slack mentions, DMs and thread updates and adds the action items for you to a task list. It needs the Claude Code CLI logged in, the claude.ai Slack connector authorized in Claude Code (run `/mcp` and authorize it), and this server already set up with `npm run setup`.

Copy `automation/config.example.env` to a private place outside this repo, fill in the task list ID and schedule, then install and run it once.

```sh
bash automation/install.sh /path/to/your/config.env
launchctl kickstart gui/$(id -u)/local.google-tasks-mcp.slack-sync
tail -f ~/Library/Logs/google-tasks-mcp-local/slack-sync.log
```

`install.sh` copies the config to `~/.config/google-tasks-mcp-local/automation/` and registers a launchd job, so the job does not depend on where your config lives. `install.sh --uninstall` removes the job and keeps the copied config. Keep the repository outside `~/Documents`, `~/Desktop` and `~/Downloads`: macOS blocks launchd jobs from reading those folders, and the job fails with `Operation not permitted`.

Slack text is treated as untrusted. The headless run is allowed only the read-only Slack tools you list plus `list_tasks`, `insert_task` and `patch_task` on one task list, and `--permission-mode dontAsk` denies everything else. Each run uses your Claude subscription usage.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Claude says authorization is required | `npm run auth` (work: `npm run auth -- --profile work`) |
| `401 invalid_client` / `The OAuth client was not found` | Wait a few minutes after creating the client, or the JSON is stale/deleted |
| `redirect_uri_mismatch` | The client type is "Web application". Recreate it as "Desktop app" |
| `access_denied` / 403 | App not published (add yourself as a test user), or blocked by org policy |
| Authorization expires every 7 days | Publish the app, then run `npm run auth` |

## Uninstall

```sh
claude mcp remove google-tasks -s user
rm -rf ~/.config/google-tasks-mcp-local
```

Then remove access at [Google Account → Third-party apps & services](https://myaccount.google.com/permissions).

## How it works

```
Claude Code ──stdio──▶ google-tasks-mcp-local (local process) ──HTTPS──▶ Google Tasks API
                              │
                              └ ~/.config/google-tasks-mcp-local/<profile>/
                                   credentials.json  OAuth client (0600)
                                   token.json        token (0600)
```

Authorization uses loopback OAuth on `127.0.0.1`, verified with PKCE and state. Access tokens refresh automatically. The scope is `https://www.googleapis.com/auth/tasks`, or `tasks.readonly` with `--readonly`.

Logs go to stderr only, and tokens are never logged.

<details>
<summary>Commands, environment variables, tools</summary>

| Command | Description |
| --- | --- |
| `npm run setup -- [JSON] [--profile NAME] [--readonly]` | Install the client JSON, authorize, register |
| `npm run auth -- [--profile NAME] [--readonly]` | Re-authorize |
| `node build/index.js` | Start as an MCP server (Claude starts it for you) |

| Variable | Default | Description |
| --- | --- | --- |
| `GOOGLE_TASKS_PROFILE` | `default` | Profile name (`--profile` takes precedence) |
| `GOOGLE_TASKS_READONLY` | unset | `1` registers only the 4 read tools |
| `GOOGLE_TASKS_TOOLS` | unset | Comma-separated tool names to register (e.g. `list_tasks,insert_task`). Unknown names are an error |
| `GOOGLE_TASKS_ALLOWED_LISTS` | unset | Comma-separated task list IDs. Other lists are refused, list creation is disabled, and `list_task_lists` shows only these |
| `XDG_CONFIG_HOME` | `~/.config` | Base directory for storage |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

Tools: `list_task_lists`, `get_task_list`, `insert_task_list`, `update_task_list`, `patch_task_list`, `delete_task_list`, `list_tasks`, `get_task`, `insert_task`, `update_task`, `patch_task`, `delete_task`, `clear_completed_tasks`, `move_task` (read-only mode: the 4 `list_` / `get_` tools)

</details>

## License

MIT. Forked from [akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp).

If this is useful to you, a star helps others find it.
