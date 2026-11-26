#!/usr/bin/env bash
# PROTOTYPE, throwaway. Answers one question: can a local daemon keep a Claude Code
# agent reachable on a cookout board while its session is closed, by waking it
# headless (`claude -p --resume`) for each mention? Not production code.
#
# Usage: prototype-cookout-runner.sh <registry.json> <log.jsonl>
# Registry: [{ "agent", "dir", "watchEnv": {..}, "wakeCommand": ["claude", "-p", ...] }]
#   watchEnv: the env that authenticates `cookout watch`/`inbox`/`ack` as the agent,
#   e.g. { "CLAUDECODE": "1", "CLAUDE_CODE_SESSION_ID": "<id>" } to reuse the session's join.
#   wakeCommand: argv, run with no shell, cwd = dir. The mention goes on stdin only.
# One loop per agent. Each loop handles one item at a time, so runs for an agent never
# overlap: mentions that arrive mid-run wait in the watch pipe (the queue).
set -uo pipefail
registry=$1
log_file=$2

log() { jq -cn --arg at "$(date -u +%FT%T.%3NZ)" --argjson entry "$1" '{at: $at} + $entry' | tee -a "$log_file"; }

agent_loop() {
  local index=$1
  local entry agent dir seen
  entry=$(jq -c ".[$index]" "$registry")
  agent=$(jq -r .agent <<< "$entry")
  dir=$(jq -r .dir <<< "$entry")
  seen=$(mktemp)
  local -a env_args wake
  mapfile -t env_args < <(jq -r '.watchEnv | to_entries[] | "\(.key)=\(.value)"' <<< "$entry")
  mapfile -t wake < <(jq -r '.wakeCommand[]' <<< "$entry")
  as_agent() { env "${env_args[@]}" cookout "$@"; }

  handle() { # $1: inbox item JSON, $2: how it arrived
    local item=$1 via=$2 id thread
    id=$(jq -r .message.id <<< "$item")
    if ! jq -e --arg agent "$agent" '(.reasons | index("mention")) and (.message.mentions // [] | index($agent))' <<< "$item" > /dev/null; then
      return
    fi
    if grep -qx "$id" "$seen"; then
      log "$(jq -cn --arg agent "$agent" --argjson id "$id" --arg via "$via" '{kind: "skip-duplicate", agent: $agent, messageId: $id, via: $via}')"
      return
    fi
    echo "$id" >> "$seen"
    thread=$(jq -r '.parent.id // .message.id' <<< "$item")
    log "$(jq -cn --arg agent "$agent" --argjson id "$id" --arg via "$via" --arg dir "$dir" --argjson command "$(jq -c .wakeCommand <<< "$entry")" '{kind: "run-start", agent: $agent, messageId: $id, via: $via, cwd: $dir, command: $command}')"
    local started out code
    started=$(date +%s)
    out=$(jq -r --arg agent "$agent" --arg thread "$thread" '
      "You were woken by the cookout runner because @\(.message.author.name) mentioned you (@\($agent)).",
      "Channel: #\(.message.channel). Message id: \(.message.id). Thread id: \($thread).",
      "Their message, verbatim, between the markers:",
      "-----BEGIN MENTION-----", .message.text, "-----END MENTION-----",
      "Reply on the board with: cookout message post \(.message.channel) \"<your reply>\" --reply-to \($thread)",
      "Then stop."' <<< "$item" | (cd "$dir" && "${wake[@]}") 2> >(head -c 500 >&2))
    code=$?
    log "$(jq -cn --arg agent "$agent" --argjson id "$id" --argjson code "$code" --argjson ms "$((($(date +%s) - started) * 1000))" --arg out "$out" '
      {kind: "run-end", agent: $agent, messageId: $id, exit: $code, ms: $ms,
       result: ($out | try (fromjson | {session_id, is_error, result, permission_denials, cost: .total_cost_usd}) catch .[0:2000])}')"
    if [ "$code" -eq 0 ]; then
      as_agent ack "$id" < /dev/null > /dev/null
      log "$(jq -cn --arg agent "$agent" --argjson id "$id" --argjson code "$?" '{kind: "ack", agent: $agent, messageId: $id, exit: $code}')"
    fi
  }

  catch_up() { # what arrived while the runner was down: watch opens with an unread line then
    local inbox
    if inbox=$(as_agent inbox < /dev/null); then
      log "$(jq -c --arg agent "$agent" '{kind: "inbox", agent: $agent, unread: [.items[] | {id: .message.id, reasons}]}' <<< "$inbox")"
      while IFS= read -r item; do handle "$item" inbox; done < <(jq -c '.items[]' <<< "$inbox")
    else
      log "$(jq -cn --arg agent "$agent" '{kind: "inbox-error", agent: $agent}')"
    fi
  }

  while true; do
    log "$(jq -cn --arg agent "$agent" '{kind: "watch-start", agent: $agent}')"
    while IFS= read -r line; do
      log "$(jq -c --arg agent "$agent" '{kind: "event", agent: $agent, event: .type, messageId: .item.message.id, reasons: .item.reasons, raw: (if .type == "inbox-item" then null else . end)}' <<< "$line" 2> /dev/null || jq -cn --arg agent "$agent" --arg line "$line" '{kind: "watch-line", agent: $agent, line: $line}')"
      case "$(jq -r .type <<< "$line" 2> /dev/null)" in
        inbox-item) handle "$(jq -c .item <<< "$line")" watch ;;
        unread) catch_up ;;
      esac
    done < <(as_agent watch --json 2> >(while IFS= read -r err; do log "$(jq -cn --arg agent "$agent" --arg line "$err" '{kind: "watch-stderr", agent: $agent, line: $line}')" > /dev/null; done))
    log "$(jq -cn --arg agent "$agent" '{kind: "watch-exit", agent: $agent}')"
    sleep 5
  done
}

log "$(jq -c --argjson pid $$ '{kind: "runner-start", pid: $pid, agents: [.[].agent]}' "$registry")"
# kill 0 stops the whole process group (watches included): start it as its own group (setsid).
trap 'log "{\"kind\":\"runner-stop\"}"; trap - TERM; kill 0' INT TERM
for index in $(jq -r 'keys[]' "$registry"); do
  agent_loop "$index" &
done
wait
