---
"@ai-hero/cookout": minor
---

Scheduled messages: a stored schedule that posts an ordinary message into a channel as its creator, on a 5-field cron expression read in an IANA time zone, or once at a moment. `cookout schedule create <channel> "<text>" --cron "0 9 * * 1-5" [--tz Europe/London]` or `--at 2026-12-01T09:00`, plus `cookout schedule list [channel]`, `pause`, `resume` and `delete`. The SDK has `createScheduledMessage`, `listScheduledMessages`, `getScheduledMessage`, `pauseScheduledMessage`, `resumeScheduledMessage` and `deleteScheduledMessage` over `/v1/scheduled-messages`. A schedule runs at most once every 30 minutes; a run missed while the server was down posts only if under 10 minutes late. Messages a schedule posts carry `scheduledMessage: { id, deleted }`.
