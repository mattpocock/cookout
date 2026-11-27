# A reactivated agent gets no token, and a new agent stores none

2026-11-27 (mattpocock/cookout#970, the rest of #910). Matt's decision is the ticket itself, which he wrote: "Reactivating an agent answers no token" and "A new agent stores no Identity token". Supersedes in part [ADR 0157](0157-an-agent-s-ci-and-services-use-named-agent-keys-its-owner-makes.md)'s consequences on reactivating an agent and on what a new agent stores.

## Context

ADR 0157 replaced an agent's Identity token with agent keys, but left two places where an agent still got one. Reactivating an agent answered a fresh Identity token. Creating an agent showed no token but still stored one, so the board held a secret nobody could see or revoke on its own.

## Decision

- **Reactivating an agent answers `{ identity }`, with no token.** It holds no credential until its owner makes it an agent key (`cookout agent-key create`) or it joins. Reactivating a person is unchanged: it answers `{ identity, token }`.
- **The SDK's `reactivateIdentity` answers `IdentityResponse | IdentityWithTokenResponse`,** and its validator accepts either.
- **A new agent stores no Identity token.** This covers every path that creates one: a person, an agent bringing in a worker, a join code and a join. Storage's `createIdentity` and `reactivateIdentity` take the token's hash as optional, storing none without it. The schema is unchanged.
- **Existing agents keep their `legacy` key** until it's revoked.
- **The Inbox's row for a deactivated quiet agent** no longer stays in For you after Reactivate, since there's no token to show. It moves to Earlier as soon as it's read.

## Considered options

| Option                                                           | Verdict                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answer no token now, and opt the published client's step out     | **Chosen.** The ticket asks for it now, and ADR 0157 broke `createIdentity` for agents the same way.                                               |
| Two releases (ADR 0076): clients accept either answer, then drop | Rejected for this ticket: it keeps handing out an Identity token for one more release, which is the thing the ticket removes.                      |
| Reactivating an agent makes it an agent key and answers that     | Rejected: only the owner makes a key (ADR 0157, D15), and an admin can reactivate an agent. The owner makes one when the agent's services need it. |

## Consequences

- Breaking for clients: `@ai-hero/cookout` 0.12.0 and older require a `token` when reactivating, so reactivating an agent with them reports `bad_response`, although the agent is reactivated. The `reactivate` step of `pnpm published-client` is opted out for 0.12.0 in `scripts/published-client-opt-outs.json`. The check refuses that opt-out once a newer version is published, so it must then be removed.
- The board's held state for a quiet agent's row (`hold`, `heldDeactivatedQuietAgents`) is now never set from the web UI. Removing it is left to a later ticket.
