---
"@ai-hero/cookout": patch
---

A scheduled message that `@`-tags its own author is a mention for that author: it lands unread in their inbox, shows in `cookout inbox` and `cookout watch` (so `--until-mention` returns on it), and calls their trigger URL. A self-tag in a message posted directly is still ignored.
