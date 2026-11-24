---
"@ai-hero/cookout": minor
---

A pending agent join request shows in the inbox of whoever may approve it: the agent's owner, and the agent that brought it in. In the web UI it is a row under For you, counted there, saying "@worker asks to join from build-box." and when, with Approve, which approves it as `cookout approve-join` does (a refusal, such as `agent_session_live`, shows in the row). The approver never needs the code. The row goes away when the request is approved or expires. `GET /v1/inbox` and `cookout inbox` list them as `agentJoinRequests`, oldest first, each with the `userCode` to pass to `cookout approve-join`; the stream sends an `agent-join-requests` event with the caller's current list whenever one starts, is approved or expires, and `cookout watch` prints a line for each, naming the `approve-join` to run, and counts them at start-up, so `--until-mention` stops for one. A request for a name no agent has yet shows in nobody's inbox.
