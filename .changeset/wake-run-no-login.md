---
"@ai-hero/cookout": patch
---

A wake run never uses the person's Login: the runner sets `COOKOUT_WAKE_RUN=1` in its environment, and there a verb that would fall back to the Login under `HOME`, such as `cookout join --as <another agent>`, exits 1 with `wake_run_no_login`. Verbs sent with the woken agent's own agent session work as before. `cookout login approve` inside a harness or a wake run exits 1 with `approval_in_harness`, even with `COOKOUT_ALLOW_HUMAN=1`. `cookout join` with your Login in an interactive harness is unchanged.
