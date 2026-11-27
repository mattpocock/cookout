---
"@ai-hero/cookout": minor
---

Breaking: a wake run has no timeout. The runner lets it run until its process exits and never kills it on a timer, so a long, healthy run is no longer cut off at 10 minutes. `cookout join --wake` and `cookout runner register` no longer take `--timeout`; a registration written with `timeoutMinutes` by an older CLI still loads and the field is ignored. The runner no longer prints `timedOutAfterMinutes` or logs a `timeout` event, and the SDK's `WakeRunFailure` is now only `{ exitCode }`. A run that exits non-zero still replies in its threads and makes its agent Unreachable.
