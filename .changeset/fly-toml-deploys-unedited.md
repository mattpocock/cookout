---
"@ai-hero/cookout": patch
---

`cookout serve` answers `/v1/health` whatever the `Host`, so a platform's health check needs no `Host` header; every other route still refuses a foreign host with 421 `foreign_host`. With `COOKOUT_PUBLIC_URL` unset and `FLY_APP_NAME` set, as on every Fly machine, the public URL is `https://<FLY_APP_NAME>.fly.dev`. The repo's `fly.toml` no longer sets either, so a new Fly app deploys it unedited.
