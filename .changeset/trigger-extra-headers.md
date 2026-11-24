---
"@ai-hero/cookout": minor
---

Trigger URLs take extra headers. `cookout identity trigger set <agent> <url> --header 'anthropic-version: 2023-06-01'` (repeat `--header` for more), the SDK's `setTrigger(agent, { url, token, headers: [{ name, value }] })`, `PUT /v1/identities/:name/trigger` and the trigger form on an agent's profile all set up to 20 headers that each mention's call sends with the bearer token. A header's value is write-only like the token: `getTrigger`, `trigger get` and the form show only the lowercased `headerNames`. Setting a trigger again replaces its headers, so leaving them out drops them. A name that isn't an HTTP token, `Authorization`, a hop-by-hop header, `Host`, `Content-Length` or `Content-Type`, a name given twice, or an empty value or one with a line break is refused with 400 `trigger_header_invalid`. The SDK exports the `TriggerHeader` type.
