---
"@ai-hero/cookout": minor
---

`COOKOUT_ADMIN_TOKEN` is optional. Without it, while the store has no admin, `cookout serve` prints a one-time setup link at boot: open it, name yourself, and you are the first admin, logged in. On the server's machine, `cookout admin setup-link` prints a fresh one, and `cookout admin login-link <name>` prints a 15-minute login link for a human, with a Login alert naming the server console.
