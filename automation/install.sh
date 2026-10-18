#!/usr/bin/env bash
# Install or remove the launchd job for the Slack -> Google Tasks sync.
# Usage: install.sh <config.env> | install.sh --uninstall
# DRY_RUN=1 prints the plist to stdout instead of writing and loading it.
set -euo pipefail

label="local.google-tasks-mcp.slack-sync"
plist="$HOME/Library/LaunchAgents/$label.plist"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${XDG_CONFIG_HOME:-$HOME/.config}/google-tasks-mcp-local/automation"
log_dir="$HOME/Library/Logs/google-tasks-mcp-local"
log_file="$log_dir/slack-sync.log"
domain="gui/$(id -u)"

if [ $# -ne 1 ]; then
  echo "usage: install.sh <config.env> | install.sh --uninstall" >&2
  exit 2
fi

if [ "$1" = "--uninstall" ]; then
  launchctl bootout "$domain/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "removed $plist (config kept in $state_dir)"
  exit 0
fi

[ -f "$1" ] || { echo "config not found: $1" >&2; exit 2; }
# shellcheck disable=SC1090
source "$1"
: "${TASK_LIST_ID:?TASK_LIST_ID is required}"
[[ "$TASK_LIST_ID" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "TASK_LIST_ID must be a single task list id" >&2; exit 2; }
SCHEDULE="${SCHEDULE:-}"
[ -n "$SCHEDULE" ] || { echo "SCHEDULE is empty" >&2; exit 2; }

xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# Expand "1-5@09:00 1,3@18:30" into <dict> entries
intervals=""
for entry in $SCHEDULE; do
  days="${entry%@*}"
  time="${entry#*@}"
  if ! [[ "$entry" == *@* && "$time" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
    echo "invalid SCHEDULE entry: $entry" >&2; exit 2
  fi
  hour=$((10#${BASH_REMATCH[1]})); minute=$((10#${BASH_REMATCH[2]}))
  if [ "$hour" -gt 23 ] || [ "$minute" -gt 59 ]; then
    echo "invalid time in SCHEDULE entry: $entry" >&2; exit 2
  fi
  IFS=',' read -r -a parts <<< "$days"
  for part in "${parts[@]}"; do
    if [[ "$part" =~ ^([0-7])-([0-7])$ ]]; then
      from="${BASH_REMATCH[1]}"; to="${BASH_REMATCH[2]}"
    elif [[ "$part" =~ ^[0-7]$ ]]; then
      from="$part"; to="$part"
    else
      echo "invalid weekday in SCHEDULE entry: $entry" >&2; exit 2
    fi
    [ "$from" -le "$to" ] || { echo "invalid weekday range: $entry" >&2; exit 2; }
    for ((d = from; d <= to; d++)); do
      intervals+="    <dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>$hour</integer><key>Minute</key><integer>$minute</integer></dict>"$'\n'
    done
  done
done

node_bin="$(command -v node)"
claude_bin="$(command -v claude || true)"
[ -n "$claude_bin" ] || { echo "claude CLI not found in PATH" >&2; exit 1; }
gh_bin="$(command -v gh || true)"
path_value="$(dirname "$node_bin"):$(dirname "$claude_bin")"
[ -z "$gh_bin" ] || path_value="$path_value:$(dirname "$gh_bin")"
path_value="$path_value:/usr/bin:/bin"
copied_config="$state_dir/config.env"

plist_content="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(printf '%s' "$repo/automation/run.sh" | xml)</string>
    <string>$(printf '%s' "$copied_config" | xml)</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(printf '%s' "$path_value" | xml)</string>
    <key>HOME</key><string>$(printf '%s' "$HOME" | xml)</string>
  </dict>
  <key>StandardOutPath</key><string>$(printf '%s' "$log_file" | xml)</string>
  <key>StandardErrorPath</key><string>$(printf '%s' "$log_file" | xml)</string>
</dict>
</plist>"

if [ "${DRY_RUN:-}" = "1" ]; then
  printf '%s\n' "$plist_content"
  exit 0
fi

mkdir -p "$state_dir" "$log_dir" "$(dirname "$plist")"
chmod 700 "$state_dir" "$log_dir"
( umask 077; : >> "$log_file" )
chmod 600 "$log_file"
( umask 077; cp "$1" "$copied_config" )
chmod 600 "$copied_config"
printf '%s\n' "$plist_content" > "$plist"
plutil -lint "$plist"

launchctl bootout "$domain/$label" 2>/dev/null || true
launchctl bootstrap "$domain" "$plist"

echo "installed $label"
echo "run once now: launchctl kickstart $domain/$label"
echo "view logs:    tail -f $log_file"
