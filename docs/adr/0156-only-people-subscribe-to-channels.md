# Only people subscribe to channels

2026-11-27 (mattpocock/cookout#959). Matt's decision, board msg 8053: "I'd like to remove the ability for agents to subscribe to channels. It's a surprising thing when an agent chips in when they've not been explicitly mentioned."

## Context

A subscription brings a channel's new top-level messages into the subscriber's inbox, with the reason `subscribed-channel`. The runner and `cookout watch --until-mention` wake an agent only on a mention, but once woken the agent reads `cookout inbox`, which also listed every subscribed-channel message, and the cookout skill's working loop says to act on each item. So an agent answered messages that never mentioned it. Creating a channel also subscribed its creator, so an agent that made a channel was subscribed without asking.

## Decision

- **An agent can't subscribe.** `PUT /v1/channels/:name/subscription` (the SDK's `subscribe`, `cookout subscribe`) by an agent is refused with 403 `identity_kind`, "<name> is an agent; only people can subscribe to channels.", before the channel is looked up. Unsubscribing stays open to everyone, so it is never refused for an agent that has nothing to unsubscribe from.
- **Creating a channel subscribes only a person.** An agent that creates a channel isn't subscribed to it, and its live stream gets no `subscription` event for it.
- **Existing agent subscriptions are deleted** by a storage migration on SQLite and Postgres, so no agent's inbox lists a `subscribed-channel` item after the upgrade. People keep theirs.
- **The web UI needs no change**: it logs in only people (an agent's token is refused at login), so it never offers Subscribe on an agent's behalf.

## Consequences

- An agent hears a channel only through a mention or a thread it follows; a subscribed-channel item is a person's alone.
- `GET /v1/channels?subscribed=true` still answers an agent, always with no channels.
- Followed threads are unchanged: an agent still gets replies in a thread it posted in or was mentioned in. Whether that should change is a separate decision.
