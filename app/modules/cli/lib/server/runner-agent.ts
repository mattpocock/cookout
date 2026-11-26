import { Array as Arr, Effect, Stream } from "effect";
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
  const started = Effect.andThen(
    keeper.set("running"),
    Effect.ignore(callClient((client) => client.startWakeRun())(asAgent)),
  );
  const ended = Effect.andThen(
    Effect.ignore(callClient((client) => client.endWakeRun())(asAgent)),
    keeper.set("connected"),
  );
  return (run) => Effect.andThen(started, Effect.ensuring(run, ended));
}

function listen(
  listening: Listening,
  { asAgent, keeper, queue }: Heeding,
): Effect.Effect<void, CallFailure, Scope.Scope> {
  return Effect.gen(function* listenAndHear() {
    const runnerOf = { opened: asAgent, runner: true };
    const first = yield* start(runnerOf);
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
      const queue = yield* wakeQueue({ during: presenceDuring(asAgent, keeper), place: listening.place, registration });
      const heard = Effect.scoped(listen(listening, { asAgent, keeper, queue }));
      const ended = yield* Effect.exit(Effect.raceFirst(heard, file.beside(REGISTRATION_SUFFIX).untilGone));
      yield* queue.stop;
      yield* forgetRunnerState(file);
      yield* ended;
      yield* printErrorLine({ agent: registration.agent, unregistered: true });
    }),
  );
}

function reportStop(
  registered: RegisteredSession,
  failure: CallFailure,
  stillRegistered: boolean,
): Effect.Effect<void> {
  const { agent } = registered.registration;
  const error = { code: failure.code, message: failure.message };
  if (!stillRegistered) {
    return printErrorLine({ agent, unregistered: true });
  }
  if (endedSessionCodes.has(failure.code)) {
    return Effect.andThen(
      Effect.ignore(dropRegistration({ failure, registered })),
      printErrorLine({ agent, dropped: true, error }),
    );
  }
  return printErrorLine({ agent, error });
}

function onStop({ connected, registered }: Listening) {
  return (failure: CallFailure): Effect.Effect<void> =>
    Effect.gen(function* stopListening() {
      yield* forgetRunnerState(registered.file);
      const { exists } = registered.file.beside(REGISTRATION_SUFFIX);
      const stillRegistered = yield* Effect.orElseSucceed(exists, () => false);
      yield* reportStop(registered, failure, stillRegistered);
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
