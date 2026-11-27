import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option } from "effect";
import { answer, answered } from "./output.ts";
import type { CallFailure } from "./adapters/call-failure.ts";
import { isPublicId } from "../../../logins/index.ts";

const agentArgument = Argument.String("agent").pipe(Argument.withDescription("The agent's name."));

const keyNotFound: CallFailure = {
  code: "agent_key_not_found",
  message: "A key's ID is the 16-character id that cookout agent-key list prints.",
};

const agentKeyCreateCommand = Command.make(
  "create",
  {
    agent: agentArgument,
    expires: Flag.String("expires").pipe(
      Flag.optional,
      Flag.withDescription(
        "How long until the key stops working: a count and s, m, h or d, such as 30d. Left out, never.",
      ),
    ),
    name: Argument.String("key-name").pipe(
      Argument.withDescription(
        "1-40 lowercase letters, digits, '.', '_' or '-', such as ci: unique among its live keys.",
      ),
    ),
  },
  ({ agent, expires, name }) => {
    const expiry = Option.match(expires, { onNone: () => ({}), onSome: (expiresIn) => ({ expiresIn }) });
    return answer((client) => client.createAgentKey(agent, { name, ...expiry }));
  },
).pipe(
  Command.withDescription(
    "Make a key for an agent you own, for its CI or a service. Its secret is printed this once: set it as the agent's COOKOUT_TOKEN.",
  ),
);

const agentKeyListCommand = Command.make("list", { agent: agentArgument }, ({ agent }) =>
  answer((client) => client.listAgentKeys(agent)),
).pipe(
  Command.withDescription(
    "List an agent's live keys, oldest first, with when each was made and last used (its owner, or an admin). Never a secret.",
  ),
);

const agentKeyRevokeCommand = Command.make(
  "revoke",
  { agent: agentArgument, id: Argument.String("id").pipe(Argument.withDescription("The key's id, from list.")) },
  ({ agent, id }) => {
    if (!isPublicId(id)) {
      return answered(Effect.fail(keyNotFound));
    }
    return answer((client) => client.revokeAgentKey(agent, id));
  },
).pipe(
  Command.withDescription(
    "Revoke an agent's key (its owner, or an admin), with the agent sessions joined with it. Its other keys keep working.",
  ),
);

export const agentKeyCommand = Command.make("agent-key").pipe(
  Command.withDescription("Make, list and revoke an agent's keys: long-lived secrets for its CI and services."),
  Command.withSubcommands([agentKeyCreateCommand, agentKeyListCommand, agentKeyRevokeCommand]),
);
