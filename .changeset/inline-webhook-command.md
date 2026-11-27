---
"@ai-hero/cookout": minor
---

In a channel's message box, a Webhook command whose form is one text field takes its value inline: `/deploy main` and Enter calls `deploy` with `{ "branch": "main" }`, and picking it from `Command suggestions` completes the box to `/deploy `. A refused inline call opens the `Call /deploy` form with the value and the refusal; `/deploy` alone opens the form. Every other Webhook command opens its form, as before, and sending `/<name> <text>` for one opens it too.
