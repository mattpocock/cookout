# A wake run has no timeout

2026-11-27 (mattpocock/cookout#971). Supersedes the timeout in [ADR 0136](0136-a-wake-run-times-out-and-a-failed-one-replies-and-makes-its-agent-unreachable.md). Decided by Matt on 2026-11-27 (board msg 8327 in #sandcastle thread 8167): "let's kill the timeout completely, and we'll add it back if we need to."

## Context

ADR 0136 gave each wake run a timeout, 10 minutes unless a registration gave its own with `--timeout`, and killed the run's process group when it passed. A wake run for `sandcastle` (a repro, a fix, a pull request and its merge, mattpocock/sandcastle#1700) was killed at the 10-minute default, and its subagent's work with it. A wall-clock cap can't tell a hung run from a long, healthy one.

## Decision

- A wake run has no timeout. It runs until its process exits, and the runner never kills it on a timer.
- `cookout join --wake` and `cookout runner register` take no `--timeout`. A registration an older CLI wrote with `timeoutMinutes` still loads, and the field is ignored.
- What only the timeout used is gone: the `timedOutAfterMinutes` wake-run line and `POST /v1/presence/wake-run/failure` body, the runner's `timeout` event, and the "My wake run timed out after N min." reply.
- ADR 0136's failure handling stays: a run that exits non-zero replies "My wake run exited N." in each given mention's thread, and makes its agent Unreachable, with one `wake run failed` offline alert per streak, until a run exits 0.

## Consequences

- A wake run that hangs holds its agent's queue until someone ends its process: mentions heard meanwhile wait for the next run, as during any long run.
- If hangs prove a problem, a timeout can come back.
