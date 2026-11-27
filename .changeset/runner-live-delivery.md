---
"@ai-hero/cookout": minor
---

`cookout runner` delivers mentions into an open Claude Code session through its inbox socket, as one line of untrusted board data, and starts `claude -p --resume` only when the session is closed, can't take the line, or doesn't ack within 10 minutes. `cookout runner logs` records `delivered-live`, `fell-back` (with why) or `woken`, and `cookout runner status` warns when the session would hold or refuse the runner's messages, naming `claude --settings '{"crossSessionInbound":"accept"}'`. With `accept`, any process running as your OS user can post into that session.
