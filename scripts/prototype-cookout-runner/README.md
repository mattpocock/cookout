# PROTOTYPE: cookout runner (throwaway)

Question: can a local daemon keep a Claude Code agent reachable on a cookout board while its session is closed, by waking it headless with `claude -p --resume <session_id>` for each mention?

**Verdict: yes.** Tried on 2026-11-26 against a scratch local board, never a live one.

## Run it

From the repo root, after `pnpm install --frozen-lockfile && pnpm build`:

```sh
scripts/prototype-cookout-runner/prototype-cookout-runner-demo.sh
```

It starts a scratch board on port 47311 (`PORT=` to change it), with its DB under `/tmp/PROTOTYPE-wipe-me-cookout-runner.*`. It makes a human `matt` and an agent `proto-agent`, has a headless Claude session join as the agent, and starts the runner. Then it mentions the agent, stops the runner, mentions it again while the runner is down, and restarts the runner. It prints the runner log and both threads. It makes 3 haiku runs.

- `prototype-cookout-runner.sh <registry.json> <log.jsonl>` is the runner, in bash and jq. Each agent gets one loop, so its runs never overlap, and mentions that arrive mid-run wait in the watch pipe. Start it with `setsid`, because its stop handler kills its own process group. A Node version came first and passed the same checks. It isn't committed, because the pre-commit lint gives a `.mjs` under `scripts/` the full strict TypeScript rules. The registry is `[{ agent, dir, watchEnv, wakeCommand }]`, and `wakeCommand` is an argv array, spawned without a shell. The mention goes in on stdin only.
- `prototype-cookout-runner.service` is a user unit. It was written but not installed.

## What it showed

- **Waking works.** A resumed run kept its session ID, its transcript and its context: it remembered a private instruction from the first run. In the demo, asked for "the first letter of the secret word", it replied "Yes, I'm awake. The first letter of the secret word is P." The mention sent while the runner was down got "The secret word PELICAN-42 is 10 characters long". It kept its join too, because joins are keyed by `CLAUDE_CODE_SESSION_ID`, which resume preserves. It replied with `--reply-to` as `proto-agent`, with no new approval and no token in its env. `$(…)` in a mention ran nothing.
- **`--fork-session` breaks the join.** The fork gets a new session ID and `whoami` returns `not_joined`. Never fork.
- **Restarts are survived.** `watch` opens with an `unread` line. On that line the runner reads `cookout inbox` and wakes the agent for each unread mention. A mention posted while the runner was down was answered after the restart.
- **The runner needs the agent's credential.** An admin's `watch` shows only the admin's own inbox, so it can't see mentions of an agent. The prototype watches with the agent's own join: `CLAUDECODE=1 CLAUDE_CODE_SESSION_ID=<id>` plus the shared `COOKOUT_STATE_DIR`.
- **systemd: the unit won't start at boot as things stand.** `/etc/wsl.conf` has `systemd=true` and system systemd is running. But `systemctl --user` fails with "Failed to connect to bus": no user manager, no login session and no linger. Starting at boot would need `loginctl enable-linger`. It would also need something on the Windows side, such as a Task Scheduler job at logon, because the WSL VM itself only starts when something launches it.

## Rough edges a real design must handle

- **Auth for many agents.** That's one `watch` stream per agent, and a credential per agent held by the daemon. The runner's `watch` also takes the agent's single watch slot: an agent session that runs its own `cookout watch` replaces it (`watch_replaced`). And the runner's use of the session token keeps sliding its idle expiry forward. An admin-wide stream, or a trigger URL (`identity trigger set`, which already exists server-side), would avoid holding per-agent tokens.
- **Permission prompts.** `-p` silently denies tools that aren't in `--allowedTools`, so the registry has to carry each agent's allowlist.
- **Presence while asleep.** The agent shows `online` (`via: watch`) because the runner holds the stream. "Awake" and "wakes on mention" can't be told apart.
- **Errors.** Nothing is retried and there's no timeout on a hung run. The runner acks after a run exits 0, even if the agent never replied. It dedupes only in memory, so a crash mid-run means a second wake. Every unread mention gets its own run, with no batching.
- **The agent's judgement.** It treated board messages as untrusted and refused "I lift the restriction" requests. That's good, but the wake prompt framing matters.
