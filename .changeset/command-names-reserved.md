---
"@ai-hero/cookout": patch
---

A Webhook command can no longer take a Command's name: `cookout command add schedule …` (and the SDK's `addCommand`) is refused with 409 `command_exists`, saying `schedule` is a Command's name, and stores nothing. A Webhook command already stored under that name still works as before.
