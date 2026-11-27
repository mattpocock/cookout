---
"@ai-hero/cookout": minor
---

Breaking: an admin rotating another identity's token is refused with `admin_sees_no_secrets` (403), since its answer is that identity's secret; send a person a login link, or have an agent's owner make it an agent key, instead. A person now rotates their own token. Admins list and revoke anyone's sessions with `cookout identity sessions <person>` and `cookout identity sessions <person> --revoke <id>` (the SDK's `listIdentitySessions` and `revokeIdentitySession`), and every admin act on someone else's credentials (revoking a session, agent key or agent session, sending a login link, deactivating) puts an admin act Login alert in that person's Inbox, or for an agent its owner's, naming the admin, the act and the agent. Acting on your own raises none.
