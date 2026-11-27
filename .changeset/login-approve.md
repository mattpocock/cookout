---
"@ai-hero/cookout": patch
---

`cookout login approve <code>` approves another machine's waiting `cookout login` from a terminal that's already logged in, the same approval the web approval page gives. An agent's credential is refused with `human_only`; an unknown, malformed or expired code is refused with the server's refusal. `cookout login`, `cookout login --token` and `cookout logout` work as before.
