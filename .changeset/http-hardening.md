---
"@ai-hero/cookout": patch
---

`cookout serve` hardens its HTTP. A request over HTTPS (on Fly, one whose `X-Forwarded-Proto` is `https`) gets `Strict-Transport-Security: max-age=31536000` and a `Secure` session cookie; a board over plain HTTP works as before, with neither. On Fly (`FLY_APP_NAME` set) a request's client address is its `Fly-Client-IP`; elsewhere that header is ignored. The routes that need no token (starting and collecting Login requests and agent join requests, and redeeming a join code) now allow `COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE` (default 30) a minute per client address instead of `COOKOUT_REQUESTS_PER_MINUTE`, and `cookout login` and `cookout join` wait out a `rate_limited` collect instead of failing.
