const AGENT_SUBSCRIPTIONS_MIGRATION =
  "DELETE FROM subscriptions WHERE identity_name IN (SELECT name FROM identities WHERE kind = 'agent');";

const POSTGRES_AGENT_SUBSCRIPTIONS_MIGRATION: readonly string[] = [
  "DELETE FROM subscriptions WHERE identity_name IN (SELECT name FROM identities WHERE kind = 'agent')",
];

export { AGENT_SUBSCRIPTIONS_MIGRATION, POSTGRES_AGENT_SUBSCRIPTIONS_MIGRATION };
