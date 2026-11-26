import { Array as Arr, Effect, Function, Option, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { During, Spawner, WakeQueue } from "./wake-queue.ts";
import { REGISTRATION_SUFFIX, opened } from "./registrations.ts";
import { dropRegistration, forgetRunnerState, keeperOf } from "./runner-state.ts";
import { source, start } from "./watch-connection.ts";
import type { Heard } from "./watch-connection.ts";
import type { Keeper } from "./runner-state.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import { callClient } from "./adapters/sdk.ts";
import { notJoined } from "./adapters/call-failure.ts";
import { printErrorLine } from "./output.ts";
import { saidFailed } from "./wake-run-failure.ts";
import { wakeQueue } from "./wake-queue.ts";

interface Listening {
  readonly connected: Effect.Effect<boolean>;
  readonly place: RunPlace;
  readonly registered: RegisteredSession;
}

interface Heeding {
  readonly asAgent: ClientWithAgentSessionState;
  readonly keeper: Keeper;
  readonly queue: WakeQueue;
}

const endedSessionCodes: ReadonlySet<string> = new Set([
  "agent_session_expired",
  "agent_session_revoked",
  notJoined.code,
]);

function isMention(event: Readonly<Heard>): event is Extract<Heard, { readonly type: "inbox-item" }> {
  return event.type === "inbox-item" && Arr.contains(event.item.reasons, "mention");
}

function presenceDuring(asAgent: ClientWithAgentSessionState, keeper: Keeper): During {
  const connected = keeper.set("connected");
  return {
    ended: Effect.andThen(Effect.ignore(callClient((client) => client.endWakeRun())(asAgent)), connected),
    failed: (failure, given) => Effect.andThen(saidFailed({ asAgent, failure, given }), connected),
    started: Effect.andThen(
      keeper.set("running"),
      Effect.ignore(callClient((client) => client.startWakeRun())(asAgent)),
    ),
  };
}

function listen(
  listening: Listening,
  { asAgent, keeper, queue }: Heeding,
): Effect.Effect<void, CallFailure, Scope.Scope> {
  return Effect.gen(function* listenAndHear() {
    const runnerOf = { opened: asAgent, runner: true };
    const first = yield* start(runnerOf);
    yield* queue.catchUp;
    const onConnected = Effect.andThen(keeper.reconnected, listening.connected);
    yield* source({ first, listening: runnerOf }).pipe(
      Stream.tap((event) => Effect.when(onConnected, Effect.succeed(event.type === "connected"))),
      Stream.filter(isMention),
      Stream.runForEach((event) => queue.hear(event.item)),
    );
  });
}

function wakeUntilUnregistered(listening: Listening): Effect.Effect<void, CallFailure, Spawner> {
  const { file, registration } = listening.registered;
  return Effect.scoped(
    Effect.gen(function* listenAndWake() {
      const keeper = yield* keeperOf(file);
      yield* keeper.set("connecting");
      const asAgent = yield* opened(listening.registered);
      const queue = yield* wakeQueue({
        asAgent,
        during: presenceDuring(asAgent, keeper),
        place: listening.place,
        registration,
      });
      const heard = Effect.scoped(listen(listening, { asAgent, keeper, queue }));
      const ended = yield* Effect.exit(Effect.raceFirst(heard, file.beside(REGISTRATION_SUFFIX).untilGone));
      yield* queue.stop;
      yield* forgetRunnerState(file);
      yield* ended;
      yield* printErrorLine({ agent: registration.agent, unregistered: true });
    }),
  );
}

function dropIfEnded(registered: RegisteredSession, failure: CallFailure): Effect.Effect<boolean> {
  const { exists } = registered.file.beside(REGISTRATION_SUFFIX);
  const drop = Effect.ignore(dropRegistration({ failure, registered }));
  const dropWhileRegistered = Effect.when(drop, Effect.orElseSucceed(exists, Function.constFalse));
  const ended = Effect.succeed(endedSessionCodes.has(failure.code));
  return Effect.map(Effect.when(dropWhileRegistered, ended), (dropped) => Option.isSome(Option.flatten(dropped)));
}

function onStop({ connected, registered }: Listening) {
  return (failure: CallFailure): Effect.Effect<void> =>
    Effect.gen(function* stopListening() {
      yield* forgetRunnerState(registered.file);
      const dropped = yield* dropIfEnded(registered, failure);
      const error = { code: failure.code, message: failure.message };
      yield* printErrorLine({ agent: registered.registration.agent, dropped, error });
      yield* connected;
    });
}

function wakeAgent(listening: Listening): Effect.Effect<void, never, Spawner> {
  return Effect.matchEffect(wakeUntilUnregistered(listening), {
    onFailure: onStop(listening),
    onSuccess: Effect.succeed,
  });
}

export { type Listening, wakeAgent };
