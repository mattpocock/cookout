# An admin oversees anyone's credentials, sees no secret, and each act alerts its person

2026-11-27 (mattpocock/cookout#914). Amends [ADR 0037](0037-any-admin-can-make-any-human-an-admin.md): an admin's power over another identity's credentials is to end them, never to hold them, and the person always hears of it.

## Context

ADR 0037 made every admin equal and able to act on anyone. An admin could rotate another identity's token, and the answer was that identity's new secret: the admin could then act as them, and the person learned of it only when their old token stopped working. An admin couldn't see or end one of a person's sessions short of rotating everything. Sending a login link (#912) already raised an admin act Login alert; nothing else did.

## Decision

- **Oversight routes.** `GET /v1/identities/:name/sessions` lists a person's live sessions as `GET /v1/sessions` lists the caller's, never with a secret, and `DELETE /v1/identities/:name/sessions/:id` revokes one with everything below it. The person named or an admin may; anyone else is 403 `admin_only`, an agent named 403 `human_only`. An agent's keys and agent session already had owner-or-admin routes (ADR 0157).
- **Every admin act on someone else's credentials alerts the person.** Revoking a session, an agent key or an agent session, sending a login link and deactivating each raise an admin act Login alert, naming the admin and the act: `revoked a session`, `revoked an agent key`, `revoked an agent session`, `sent a login link` or `deactivated`. For an agent the alert goes to its owner and names the agent (`agent`); it names the credential's public ID (`credential`) when there is one. Storage keeps the agent in a new `acted_on_agent` column; an alert recorded before it names none.
- **Acting on your own raises none.** An admin revoking their own session, their own agent's key or agent session, or sending themself a login link is an owner's act, not oversight.
- **An admin never sees a secret.** `POST /v1/identities/:name/token` naming anyone but the caller is 403 `admin_sees_no_secrets`, pointing at a login link for a person or an agent key made by its owner. A person rotates their own token, which they couldn't before without being an admin.
- **Every surface.** The SDK adds `listIdentitySessions` and `revokeIdentitySession`; `cookout identity sessions <person> [--revoke <id>]` calls them, as it already did an agent's agent session. A person's profile shows an admin their sessions with Revoke, beside Send a login link.

## Consequences

- An admin revoking an agent session it didn't bring in now raises both the offline alert and an admin act alert for the owner.
- A script that rotated another identity's token as an admin is refused; it sends a login link or makes an agent key instead.
