import { Argument, Command, Flag } from "effect/cli";
import { Console, Effect } from "effect";
import { SESSION_ID_PLACEHOLDER, registerHere, unregister } from "./registrations.ts";
import { answered, printAnswer, refused } from "./output.ts";
import { runnerStatus, statusLines } from "./runner-state.ts";

const wakeCommandArgument = Argument.String("wake-command").pipe(
  Argument.variadic(),
  Argument.withDescription(
    `The wake command's argv, after --, run with no shell. ${SESSION_ID_PLACEHOLDER} becomes this harness session's ID.`,
  ),
);

const registerCommand = Command.make("register", { wake: wakeCommandArgument }, ({ wake }) =>
  answered(registerHere(wake)),
).pipe(
  Command.withDescription(
    "Register this joined harness session with the runner: cookout runner register -- <wake command…>. Keeps the " +
      `agent, the board, this folder, PATH and the wake command (with ${SESSION_ID_PLACEHOLDER} filled in) in a ` +
      "mode-600 file beside the session's agent session state. Refused with not_joined before join.",
  ),
);

const agentArgument = Argument.String("agent").pipe(
  Argument.withDescription("The registered agent, as `cookout runner status` names it."),
);

const unregisterCommand = Command.make("unregister", { agent: agentArgument }, ({ agent }) =>
  answered(unregister(agent)),
).pipe(
  Command.withDescription(
    "Delete the agent's registration: a running runner closes that agent's live connection and starts no more " +
      "wake runs for it, and a run in progress finishes. `cookout leave` does the same for its own session. " +
      "Refused with not_registered when no registration names the agent.",
  ),
);

const jsonFlag = Flag.Boolean("json").pipe(Flag.withDefault(false), Flag.withDescription("Print the status as JSON."));

function printStatus(json: boolean) {
  return (status: Effect.Success<typeof runnerStatus>): Effect.Effect<void> => {
    if (json) {
      return printAnswer(status);
    }
    return Effect.forEach(statusLines(status), (line) => Console.log(line), { concurrency: 1, discard: true });
  };
}

const statusCommand = Command.make("status", { json: jsonFlag }, ({ json }) =>
  Effect.matchEffect(runnerStatus, { onFailure: refused, onSuccess: printStatus(json) }),
).pipe(
  Command.withDescription(
    "List each registration: its agent, its folder, and whether the runner is connecting, connected or running a " +
      "wake run for it, or no runner is running; then each dropped registration, with the refusal that dropped it " +
      "and when. --json prints the same as JSON. It prints no token.",
  ),
);

export { registerCommand, statusCommand, unregisterCommand };
