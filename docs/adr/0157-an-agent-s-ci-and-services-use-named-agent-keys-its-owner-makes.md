# An agent's CI and services use named agent keys its owner makes

Status: accepted, 2026-11-27 (mattpocock/cookout#910, spec #900). Matt's decisions are spec #900's D4, D5, D6 (its agent half) and D15, from board thread 7142: D4 and D6 asked in msg 7280 and recorded in msg 7288, D5 accepted in msg 7282, D15 accepted in msg 7289. The refusal codes `agent_key_expired` and `agent_keys_instead`, and the verbs `cookout agent-key create`, `list` and `revoke`, are proposed in the ticket, awaiting Matt. Amends [ADR 0042](0042-agent-session-tokens-replace-the-lease.md) and [ADR 0153](0153-every-credential-records-what-made-it-and-revoking-one-revokes-what-it-made.md).

## Context

A CI job or service used its agent's one Identity token. Each agent had one token, so every job shared it. The token had no name and no last-used time, and the only way to end one use of it was to rotate it, which broke every other use. Creating an agent answered that token too, so whoever created an agent held a secret that never expired.

## Decision

- **Agent keys.** An agent has any number of agent keys. Each has a public ID (16 random hex digits), a name unique among the agent's live keys (1-40 lowercase letters, digits, `.`, `_` or `-`, such as `ci`), when it was made, when it was last used (moved on each use), an optional expiry, its hash and its parent in the lineage: the owner's session that made it. A key authenticates as the agent through the `Authorization` header (`COOKOUT_TOKEN`), as the agent's Identity token did. An agent session joined with a key hangs under it, so revoking the key ends the session.
- **Routes.**
  - `POST /v1/identities/:name/agent-keys` (`{ name, expiresIn? }`, such as `30d`) answers 201 `{ agentKey, token }`. This is the only answer that carries the secret.
  - `GET /v1/identities/:name/agent-keys` answers `{ agentKeys }`: the live keys, oldest first, never a secret.
  - `DELETE /v1/identities/:name/agent-keys/:id` revokes one key with everything below it, and answers `{ ended }`.
- **Who.** Only the agent's owner makes a key (D15). An agent caller is 403 `human_only`, for itself or a worker. Anyone else is 403 `not_owner`, an admin who isn't the owner included. The owner or an admin lists and revokes keys (D16).
- **Refusals.**
  - 400 `agent_key_name_invalid` or `agent_key_expiry_invalid`.
  - 409 `agent_key_name_taken` for a live key's name.
  - 404 `identity_not_found` for a name that is no agent.
  - 404 `agent_key_not_found` for an ID that is none of the agent's live keys, or no public ID at all.
- **Expiry.** A key never expires unless made with one (D5). A key past its expiry is 401 `agent_key_expired`.
- **Deactivation** ends every key of the agent, with what each made, as it ends every other credential (ADR 0153).
- **No more agent tokens.** Creating an agent answers `{ identity }` and no secret, whether a person or an agent creating a worker made it. The owner then makes a key, or the agent joins. Rotating an agent's token is 409 `agent_keys_instead`, naming `cookout agent-key create`. A person's token still rotates.
- **CLI and SDK.**
  - The CLI verbs are `cookout agent-key create <agent> <key-name> [--expires 30d]`, `cookout agent-key list <agent>` and `cookout agent-key revoke <agent> <id>`. Each prints the answer as JSON.
  - The SDK calls are `createAgentKey`, `listAgentKeys` and `revokeAgentKey`.
  - `createIdentity`'s answer type follows the request's `kind`: `IdentityResponse` for an agent, `IdentityWithTokenResponse` for a person.
- **Upgrade (D6, its agent half).** Each agent's live Identity token becomes an agent key named `legacy`, with no expiry, as a root, keeping its hash. Every existing `COOKOUT_TOKEN` keeps working and is listed as `legacy`. People's tokens are untouched.
- **ADR 0042, amended.** An agent session's parent is the credential `join` was sent with: an agent key, or the agent's Identity token for an agent made before this. A join sent with an agent key needs no Identity token.

## Considered options

| Option                                                         | Verdict                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Named keys in their own table, each a row in the lineage       | **Chosen.** Each key is listed, used and revoked on its own, and revoking one ends the agent sessions under it through ADR 0153's cascade. |
| Keep one Identity token per agent and add a name and last used | Rejected. One secret per agent still means every job shares it, and ending one use still breaks the rest.                                  |
| Let an admin make keys for any agent                           | Rejected by D15 and D16: an admin lists and revokes but never sees a secret, and only the owner makes one.                                 |

## Consequences

- Each CI job or service gets its own key, revoked without breaking the others, and its owner sees when each was last used.
- Breaking for clients: creating an agent no longer answers a `token`, and `identity rotate <agent>` is refused. A script that read `.token` from `identity create` makes a key instead: `cookout agent-key create <agent> ci | jq -r .token`.
- Until the web UI shows an agent's keys (#911), Rotate token on an agent's card revokes every key of the agent and makes one named `web`, so the card's promise that the old token stops working still holds.
- Reactivating an agent still answers a new Identity token, as before; making that a key is left to a later ticket.
- An agent created by a person before this keeps its stored Identity token until the upgrade migration turns it into `legacy`. An agent created after it still has an Identity token stored that nobody is ever shown. The moving-over release removes Identity tokens.
