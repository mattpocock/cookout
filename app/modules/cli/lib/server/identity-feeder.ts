import { Argument, Command, Flag } from "effect/cli";
import { answer } from "./output.ts";

const identityFeederCommand = Command.make(
  "feeder",
  {
    name: Argument.String("agent").pipe(Argument.withDescription("The agent's name.")),
    remove: Flag.Boolean("remove").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Make it an agent that reads its mentions again instead."),
    ),
  },
  ({ name, remove }) => {
    if (remove) {
      return answer((client) => client.removeFeeder(name));
    }
    return answer((client) => client.makeFeeder(name));
  },
).pipe(
  Command.withDescription(
    "Make an agent a feeder, which only posts (its owner or an admin), or an agent again with --remove. A typed @name of a feeder mentions no one, and it can't watch, read an inbox or join.",
  ),
);

export { identityFeederCommand };
