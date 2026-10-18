#!/usr/bin/env bash
# Slack -> Google Tasks sync. Usage: run.sh <config.env>
# DRY_RUN=1 prints what would run without writing mcp.json or calling claude.
set -euo pipefail

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "usage: run.sh <config.env>" >&2
  exit 2
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1090
source "$1"

: "${TASK_LIST_ID:?TASK_LIST_ID is required}"
[[ "$TASK_LIST_ID" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "TASK_LIST_ID must be a single task list id" >&2; exit 2; }
TARGETS="${TARGETS:-mentions,dms,threads}"
LOOKBACK_HOURS="${LOOKBACK_HOURS:-24}"
SLACK_READ_TOOLS="${SLACK_READ_TOOLS:-}"
MODEL="${MODEL:-}"
EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS:-}"
GOOGLE_TASKS_PROFILE="${GOOGLE_TASKS_PROFILE:-default}"

if [ -z "$SLACK_READ_TOOLS" ]; then
  echo "SLACK_READ_TOOLS is empty" >&2
  exit 2
fi
# 読み取り系（search / read / list / get_reactions）以外は拒否する
if printf '%s\n' $SLACK_READ_TOOLS | grep -Evq '^mcp__claude_ai_Slack__slack_(search_[a-z_]+|read_[a-z_]+|list_[a-z_]+|get_reactions)$'; then
  echo "SLACK_READ_TOOLS must contain only read-only Slack tools (slack_search_*, slack_read_*, slack_list_*, slack_get_reactions)" >&2
  exit 2
fi

node_bin="$(command -v node)"
state_dir="${XDG_CONFIG_HOME:-$HOME/.config}/google-tasks-mcp-local/automation"
mcp_json="$state_dir/mcp.json"
work_dir="$state_dir/work"

echo "start: $(date '+%Y-%m-%d %H:%M:%S')"

# Render the prompt. Values go through the environment so special characters are safe.
prompt="$(
  TASK_LIST_ID="$TASK_LIST_ID" TARGETS="$TARGETS" LOOKBACK_HOURS="$LOOKBACK_HOURS" \
  EXTRA_INSTRUCTIONS="$EXTRA_INSTRUCTIONS" \
  node -e '
    const fs = require("fs");
    let s = fs.readFileSync(process.argv[1], "utf8");
    for (const k of ["TASK_LIST_ID", "TARGETS", "LOOKBACK_HOURS", "EXTRA_INSTRUCTIONS"]) {
      s = s.split("{{" + k + "}}").join(process.env[k] ?? "");
    }
    process.stdout.write(s);
  ' "$repo/automation/prompt.md"
)"

mcp_content="$(
  NODE_BIN="$node_bin" ENTRY="$repo/build/index.js" TASK_LIST_ID="$TASK_LIST_ID" \
  PROFILE="$GOOGLE_TASKS_PROFILE" \
  node -e '
    const e = process.env;
    console.log(JSON.stringify({ mcpServers: { "google-tasks-side": {
      command: e.NODE_BIN,
      args: [e.ENTRY],
      env: {
        GOOGLE_TASKS_TOOLS: "list_tasks,insert_task,patch_task",
        GOOGLE_TASKS_ALLOWED_LISTS: e.TASK_LIST_ID,
        GOOGLE_TASKS_PROFILE: e.PROFILE,
      },
    } } }, null, 2));
  '
)"

tasks_tools="mcp__google-tasks-side__list_tasks mcp__google-tasks-side__insert_task mcp__google-tasks-side__patch_task"
read -r -a allowed <<< "$SLACK_READ_TOOLS $tasks_tools ToolSearch"

# Built-in tools (Bash, Read, Web...) are disabled; only ToolSearch is kept so deferred MCP tools
# can be loaded. Every other loaded MCP tool
# is denied explicitly, because allow rules in your own settings would otherwise still apply.
base=(--tools ToolSearch --mcp-config "$mcp_json" --permission-mode dontAsk --no-session-persistence)
args=(-p "$prompt" "${base[@]}" --allowedTools "${allowed[@]}")
[ -n "$MODEL" ] && args+=(--model "$MODEL")

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "[dry-run] mcp.json would be written to: $mcp_json"
  echo "$mcp_content"
  echo "[dry-run] cwd: $work_dir"
  printf '[dry-run] claude'
  for a in "${args[@]}"; do
    if [ "$a" = "$prompt" ]; then printf ' <prompt: %s chars>' "${#prompt}"; else printf ' %q' "$a"; fi
  done
  echo
  echo "end: $(date '+%Y-%m-%d %H:%M:%S')"
  exit 0
fi

mkdir -p "$state_dir" "$work_dir"
chmod 700 "$state_dir" "$work_dir"
( umask 077; printf '%s\n' "$mcp_content" > "$mcp_json" )
chmod 600 "$mcp_json"

# Empty scratch dir so no project CLAUDE.md or files are in scope
cd "$work_dir"

# Preflight: read the tool list from the init event (exits before the model is called)
loaded="$(claude -p "ok" "${base[@]}" --output-format stream-json --verbose </dev/null 2>/dev/null | node -e '
  const rl = require("readline").createInterface({ input: process.stdin });
  rl.on("line", (l) => {
    try {
      const m = JSON.parse(l);
      if (m.type === "system" && m.subtype === "init") { console.log((m.tools || []).join("\n")); process.exit(0); }
    } catch {}
  });
' || true)"
if [ -z "$loaded" ]; then
  echo "preflight failed: could not read the tool list" >&2
  exit 1
fi
for t in "${allowed[@]}"; do
  if ! grep -qxF "$t" <<< "$loaded"; then
    echo "required tool not available: $t (is the Slack connector authorized in Claude Code?)" >&2
    exit 1
  fi
done
deny=()
while IFS= read -r t; do
  [ -n "$t" ] || continue
  printf '%s\n' "${allowed[@]}" | grep -qxF "$t" || deny+=("$t")
done <<< "$loaded"
[ ${#deny[@]} -gt 0 ] && args+=(--disallowedTools "${deny[@]}")
echo "allowed: ${#allowed[@]} tools, denied: ${#deny[@]} tools"

claude "${args[@]}" </dev/null

echo "end: $(date '+%Y-%m-%d %H:%M:%S')"
