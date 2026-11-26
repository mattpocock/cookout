#!/usr/bin/env bash
# PROTOTYPE demo, throwaway. One command, from the repo root after `pnpm install && pnpm build`:
#   scripts/prototype-cookout-runner/prototype-cookout-runner-demo.sh
# Starts a scratch board, makes a headless Claude Code session that joins it as an agent,
# starts the runner, mentions the agent, waits for the reply; stops the runner, mentions it
# again, restarts the runner and waits for that reply too, then cleans up.
# Costs three `claude -p --model haiku` runs.
set -euo pipefail
root=$(pwd)
here="$root/scripts/prototype-cookout-runner"
work=$(mktemp -d /tmp/PROTOTYPE-wipe-me-cookout-runner.XXXX)
chmod 700 "$work"
port=${PORT:-47311}
url="http://127.0.0.1:$port"
mkdir -p "$work/bin" "$work/repo" "$work/xdg"
chmod 700 "$work/xdg"
cat > "$work/bin/cookout" <<EOF
#!/usr/bin/env bash
case "\$COOKOUT_URL" in $url) ;; *) echo "prototype shim: COOKOUT_URL must be the local board" >&2; exit 97;; esac
exec node $root/dist/main.js "\$@"
EOF
chmod +x "$work/bin/cookout"
admin_token=$(openssl rand -hex 32)
clean() { env -i HOME="$HOME" USER="$USER" LANG=C.UTF-8 PATH="$work/bin:$PATH" COOKOUT_URL="$url" XDG_CONFIG_HOME="$work/xdg" COOKOUT_STATE_DIR="$work/state" "$@"; }
adm() { clean env COOKOUT_TOKEN="$admin_token" COOKOUT_ALLOW_HUMAN=1 cookout "$@"; }

COOKOUT_ADMIN_TOKEN=$admin_token COOKOUT_ADMIN_NAME=matt COOKOUT_DB="$work/PROTOTYPE-wipe-me.db" COOKOUT_HOST=127.0.0.1 PORT=$port node dist/main.js serve > "$work/serve.log" 2>&1 &
server=$!
trap 'kill $server ${runner:-} 2>/dev/null; echo "left $work for you to read, then rm -r it"' EXIT
until adm whoami > /dev/null 2>&1; do sleep 0.5; done
adm channel create runner-proto > /dev/null
adm identity create proto-agent --kind agent --display-name "Proto agent" --owner matt > /dev/null
printf '%s' "$admin_token" | clean env -u CLAUDECODE cookout login --token > /dev/null

cd "$work/repo" && git init -q
sid=$(clean claude -p 'Run `cookout join --as proto-agent`. Remember the secret word PELICAN-42. Reply in one line.' \
  --model haiku --allowedTools "Bash(cookout *)" --output-format json < /dev/null | jq -r .session_id)
echo "session: $sid"
cd "$root"
jq -n --arg dir "$work/repo" --arg sid "$sid" '[{agent:"proto-agent",dir:$dir,
  watchEnv:{CLAUDECODE:"1",CLAUDE_CODE_SESSION_ID:$sid},
  wakeCommand:["claude","-p","--resume",$sid,"--model","haiku","--allowedTools","Bash(cookout *)","--output-format","json"]}]' > "$work/registry.json"

watching() { local n; n=$(grep -c 'watching' "$work/runner.log.jsonl" 2>/dev/null); echo "${n:-0}"; }
start_runner() { # its own process group (setsid), so stopping it stops its watches too
  local before
  before=$(watching)
  setsid env -i HOME="$HOME" USER="$USER" LANG=C.UTF-8 PATH="$work/bin:$PATH" COOKOUT_URL="$url" XDG_CONFIG_HOME="$work/xdg" COOKOUT_STATE_DIR="$work/state" \
    "$here/prototype-cookout-runner.sh" "$work/registry.json" "$work/runner.log.jsonl" > /dev/null 2>&1 &
  runner=$!
  until [ "$(watching)" -gt "$before" ]; do sleep 0.5; done
}
stop_runner() { kill -TERM -- "-$runner" 2>/dev/null || true; while kill -0 "$runner" 2>/dev/null; do sleep 0.2; done; }
acks() { local n; n=$(grep -c '"kind":"ack"' "$work/runner.log.jsonl" 2>/dev/null); echo "${n:-0}"; }
trap 'stop_runner; kill $server 2>/dev/null; echo "left $work for you to read, then rm -r it"' EXIT

echo "== live mention"
start_runner
adm message post runner-proto '@proto-agent are you awake? Tell me the first letter of the secret word.' | jq -c '{posted: .message.id}'
until [ "$(acks)" -ge 1 ]; do sleep 1; done

echo "== mention while the runner is down, then restart"
stop_runner
adm message post runner-proto '@proto-agent (sent while your runner was down) how many characters is the secret word?' | jq -c '{posted: .message.id}'
start_runner
until [ "$(acks)" -ge 2 ]; do sleep 1; done

jq -c '{kind, messageId, via, exit, session: .result.session_id}' "$work/runner.log.jsonl"
for id in 1 3; do adm thread get $id | jq -c '[.. | objects | select(.text? and .author?) | {id, author: .author.name, text}] | unique[]'; done
