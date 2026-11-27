---
"@ai-hero/cookout": patch
---

Your sessions from the terminal. `cookout login list` prints your live sessions, marking this machine's as `current`. `cookout login revoke <id>` ends one and every session it approved, and when it is this machine's own it also removes the saved Login, as `cookout logout` does. `cookout logout --everywhere` says how many sessions, agent sessions and join codes it will end, asks to confirm (or takes `--yes`), then logs you out everywhere but this machine. An agent's credential is refused with `human_only`.
