import type { AgentSessionStateFailure, AgentSessionStateFile, AgentSessionStateNeeds } from "./agent-session-state.ts";
import { Array as Arr, DateTime, Effect, Function, Option, Order, Ref, Schema } from "effect";
import { DROPPED_SUFFIX, RUNNER_SUFFIX, forgetRegistration, registeredSessions } from "./registrations.ts";
import { IsoTimeSchema, isoTimeOf } from "../../../time/server.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { RegisteredSession } from "./registrations.ts";
import { filesBeside } from "./agent-session-state.ts";

const PRETTY = 2;
const SIGNAL_CHECK = 0;

type LiveState = "connected" | "connecting" | "running";
type State = LiveState | "not-running";

const RunnerStateSchema = Schema.Struct({
  pid: Schema.Int,
  state: Schema.Literals(["connected", "connecting", "running"]),
});

const DroppedSchema = Schema.Struct({
  agent: Schema.String,
  code: Schema.String,
  directory: Schema.String,
  droppedAt: IsoTimeSchema,
  message: Schema.String,
});

type Dropped = typeof DroppedSchema.Type;

interface RegistrationStatus {
  readonly agent: string;
  readonly directory: string;
  readonly state: State;
}

interface RunnerStatus {
  readonly dropped: readonly Dropped[];
  readonly registrations: readonly RegistrationStatus[];
}

const encodeRunnerState = Schema.encodeEffect(Schema.fromJsonString(RunnerStateSchema, { space: PRETTY }));
const encodeDropped = Schema.encodeEffect(Schema.fromJsonString(DroppedSchema, { space: PRETTY }));

function writeRunnerState(
  file: AgentSessionStateFile,
  state: LiveState,
): Effect.Effect<void, AgentSessionStateFailure> {
  return Effect.flatMap(Effect.orDie(encodeRunnerState({ pid: process.pid, state })), (text) =>
    file.beside(RUNNER_SUFFIX).write(text),
  );
}

interface Keeper {
  readonly reconnected: Effect.Effect<void>;
  readonly set: (state: LiveState) => Effect.Effect<void>;
}

function keeperOf(file: AgentSessionStateFile): Effect.Effect<Keeper> {
  return Effect.gen(function* keepRunnerState() {
    const current = yield* Ref.make<LiveState>("connecting");
    function set(state: LiveState): Effect.Effect<void> {
      return Effect.andThen(Ref.set(current, state), Effect.ignore(writeRunnerState(file, state)));
    }
    const reconnected = Effect.flatMap(Ref.get(current), (state) =>
      Effect.asVoid(Effect.when(set("connected"), Effect.succeed(state !== "running"))),
    );
    return { reconnected, set };
  });
}

function forgetRunnerState(file: AgentSessionStateFile): Effect.Effect<void> {
  return Effect.ignore(file.beside(RUNNER_SUFFIX).remove);
}

interface Dropping {
  readonly failure: CallFailure;
  readonly registered: RegisteredSession;
}

function dropRegistration({ failure, registered }: Dropping): Effect.Effect<void, AgentSessionStateFailure> {
  const { file, registration } = registered;
  return Effect.gen(function* dropOne() {
    const now = yield* DateTime.now;
    const { agent, directory } = registration;
    const dropped = { agent, code: failure.code, directory, message: failure.message };
    const text = yield* Effect.orDie(encodeDropped({ ...dropped, droppedAt: isoTimeOf(now) }));
    yield* file.beside(DROPPED_SUFFIX).write(text);
    yield* forgetRegistration(file);
  });
}

function isAlive(pid: number): Effect.Effect<boolean> {
  return Effect.isSuccess(Effect.try({ catch: Function.constant(pid), try: () => process.kill(pid, SIGNAL_CHECK) }));
}

function stateOf(file: AgentSessionStateFile): Effect.Effect<State, AgentSessionStateFailure> {
  return Effect.gen(function* readRunnerState() {
    const decoded = yield* Effect.orElseSucceed(file.beside(RUNNER_SUFFIX).read(RunnerStateSchema), Option.none);
    if (Option.isNone(decoded)) {
      return "not-running";
    }
    const alive = yield* isAlive(decoded.value.pid);
    if (!alive) {
      return "not-running";
    }
    return decoded.value.state;
  });
}

function statusOf({
  file,
  registration,
}: RegisteredSession): Effect.Effect<RegistrationStatus, AgentSessionStateFailure> {
  return Effect.map(stateOf(file), (state) => ({
    agent: registration.agent,
    directory: registration.directory,
    state,
  }));
}

const byAgent = Order.mapInput(Order.String, ({ agent }: { readonly agent: string }) => agent);

const runnerStatus: Effect.Effect<RunnerStatus, AgentSessionStateFailure, AgentSessionStateNeeds> = Effect.gen(
  function* readRunnerStatus() {
    const registered = yield* registeredSessions;
    const registrations = yield* Effect.forEach(registered, statusOf, { concurrency: 1 });
    const dropped = yield* filesBeside({ schema: DroppedSchema, suffix: DROPPED_SUFFIX });
    return {
      dropped: Arr.sort(
        Arr.map(dropped, ({ value }) => value),
        byAgent,
      ),
      registrations: Arr.sort(registrations, byAgent),
    };
  },
);

const stateText: Readonly<Record<State, string>> = {
  connected: "connected",
  connecting: "connecting",
  "not-running": "not running: no runner is running",
  running: "running a wake run",
};

function statusLines({ dropped, registrations }: RunnerStatus): readonly string[] {
  const held = Arr.map(registrations, ({ agent, directory, state }) => `${agent}  ${stateText[state]}  ${directory}`);
  const gone = Arr.map(
    dropped,
    ({ agent, code, directory, droppedAt }) => `${agent}  dropped: ${code} at ${droppedAt}  ${directory}`,
  );
  const lines = [...held, ...gone];
  if (!Arr.isReadonlyArrayNonEmpty(lines)) {
    return ["No agent is registered with the runner."];
  }
  return lines;
}

export { type Keeper, keeperOf, dropRegistration, forgetRunnerState, runnerStatus, statusLines };
