import { Argument, Command } from "effect/cli";
import { Array as Arr, Deferred, Effect, Fiber, Option, Stream } from "effect";
import { SESSION_ID_PLACEHOLDER, opened, registerHere, registeredSessions } from "./registrations.ts";
import { answered, printErrorLine, refused } from "./output.ts";
import { source, start } from "./watch-connection.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { ChildProcessSpawner } from "effect/process";
import type { CommandFailed } from "./output.ts";
import type { Heard } from "./watch-connection.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import { runPlace } from "./wake-run.ts";
import { wakeQueue } from "./wake-queue.ts";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

const noRegistrations: CallFailure = {
  code: "not_registered",
  message:
    "No agent is registered to wake. Inside a joined harness session run `cookout runner register -- <wake command…>`, " +
    "or join with `cookout join --as <name> --wake -- <wake command…>`.",
};

const runnerStopped: CallFailure = { code: "cli_error", message: "Every registered agent's live connection ended." };

function isMention(event: Readonly<Heard>): event is Extract<Heard, { readonly type: "inbox-item" }> {
  return event.type === "inbox-item" && Arr.contains(event.item.reasons, "mention");
}

interface Listening {
  readonly connected: Effect.Effect<boolean>;
  readonly place: RunPlace;
  readonly registered: RegisteredSession;
}

function wakeOnMentions(listening: Listening): Effect.Effect<void, CallFailure, Scope.Scope | Spawner> {
  return Effect.gen(function* listenAndWake() {
    const asAgent = yield* opened(listening.registered);
    const runnerOf = { opened: asAgent, runner: true };
    const first = yield* start(runnerOf);
    const { place, registered } = listening;
    const { catchUp, hear } = yield* wakeQueue({ asAgent, place, registration: registered.registration });
    yield* catchUp;
    yield* source({ first, listening: runnerOf }).pipe(
      Stream.tap((event) => Effect.when(listening.connected, Effect.succeed(event.type === "connected"))),
      Stream.filter(isMention),
      Stream.runForEach((event) => hear(event.item)),
    );
  });
}

function stopped({ connected, registered }: Listening) {
  return (failure: { readonly code: string; readonly message: string }): Effect.Effect<void> =>
    Effect.andThen(
      printErrorLine({ agent: registered.registration.agent, error: { code: failure.code, message: failure.message } }),
      connected,
    );
}

interface Opening {
  readonly listening: Listening;
  readonly open: Effect.Effect<boolean>;
}

function openingFor(place: RunPlace) {
  return (registered: RegisteredSession): Effect.Effect<Opening> =>
    Effect.gen(function* openingOfAgent() {
      const done = yield* Deferred.make<boolean>();
      return { listening: { connected: Deferred.succeed(done, true), place, registered }, open: Deferred.await(done) };
    });
}

function listenAll(
  registered: Arr.NonEmptyReadonlyArray<RegisteredSession>,
  place: RunPlace,
): Effect.Effect<void, never, Scope.Scope | Spawner> {
  return Effect.gen(function* listenToEveryAgent() {
    const openings = yield* Effect.forEach(registered, openingFor(place), { concurrency: 1 });
    const running = yield* Effect.forkScoped(
      Effect.forEach(openings, ({ listening }) => wakeOnMentions(listening).pipe(Effect.catch(stopped(listening))), {
        concurrency: "unbounded",
        discard: true,
      }),
    );
    yield* Effect.forEach(openings, ({ open }) => open, { concurrency: "unbounded", discard: true });
    yield* printErrorLine({ waking: Arr.map(registered, ({ registration }) => registration.agent) });
    yield* Fiber.join(running);
  });
}

const runAll: Effect.Effect<never, CallFailure, AgentSessionStateNeeds | Spawner> = Effect.scoped(
  Effect.gen(function* runRegistrations() {
    const registered = yield* registeredSessions;
    const place = yield* runPlace;
    if (!Arr.isReadonlyArrayNonEmpty(registered) || Option.isNone(place)) {
      return yield* Effect.fail(noRegistrations);
    }
    yield* listenAll(registered, place.value);
    return yield* Effect.fail(runnerStopped);
  }),
);

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

const startCommand = Command.make("start", {}, () =>
  Effect.matchEffect(runAll, { onFailure: refused, onSuccess: Effect.succeed }),
).pipe(
  Command.withDescription(
    "Run the runner in the foreground: one live connection per registration, as its agent, and on a mention a " +
      "wake run of its wake command, in the registered folder with the registered PATH, an inbox JSON of the " +
      "waiting mentions on stdin. On start, an agent's unread mentions go to one run. One agent's runs never " +
      "overlap: mentions heard during a run wait, with a stdout line each, and go to the next run together, less " +
      "any the agent acked meanwhile; a mention left unacked goes to one more run. It prints one stderr line once " +
      "every connection is open, and one stdout line as each run exits or is skipped. It never acks.",
  ),
);

const runnerCommand: Command.Command<"runner", object, object, CommandFailed, AgentSessionStateNeeds | Spawner> =
  Command.make("runner").pipe(
    Command.withDescription("Wake registered agents on mentions while their harness sessions are closed."),
    Command.withSubcommands([registerCommand, startCommand]),
  );

export { runnerCommand };
