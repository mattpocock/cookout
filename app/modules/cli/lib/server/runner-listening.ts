import { Array as Arr, Effect, Option, Order, Ref, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { InboxItem, MessageId } from "../../../sdk/index.ts";
import { lastSeenAfter, source, start, whileUnavailable } from "./watch-connection.ts";
import type { ChildProcessSpawner } from "effect/process";
import type { Heard } from "./watch-connection.ts";
import type { PresenceResponse } from "../../../presence/index.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import type { WakeQueue } from "./wake-queue.ts";
import { callClient } from "./adapters/sdk.ts";
import { opened } from "./registrations.ts";
import { printLine } from "./output.ts";
import { wakeQueue } from "./wake-queue.ts";
import { watchReplaced } from "../../../presence/index.ts";

const PRESENCE_POLL = "5 seconds";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

function isMention(event: Readonly<Heard>): event is Extract<Heard, { readonly type: "inbox-item" }> {
  return event.type === "inbox-item" && Arr.contains(event.item.reasons, "mention");
}

interface Listening {
  readonly connected: Effect.Effect<boolean>;
  readonly place: RunPlace;
  readonly registered: RegisteredSession;
}

interface Holding {
  readonly asAgent: ClientWithAgentSessionState;
  readonly listening: Listening;
  readonly runs: WakeQueue;
  readonly saw: (event: Heard) => Effect.Effect<void>;
  readonly seen: Effect.Effect<Option.Option<MessageId>>;
}

interface Hearing {
  readonly from: Option.Option<MessageId>;
  readonly holding: Holding;
  readonly onConnected: Effect.Effect<void, CallFailure>;
}

function heardUntilReplaced({ from, holding, onConnected }: Hearing): Effect.Effect<void, CallFailure> {
  const { asAgent, listening, runs, saw } = holding;
  const runnerOf = { opened: asAgent, runner: true };
  return Effect.scoped(
    Effect.gen(function* listenAsRunner() {
      const first = yield* start({ from, listening: runnerOf });
      yield* onConnected;
      yield* source({ first, from, listening: runnerOf }).pipe(
        Stream.tap(saw),
        Stream.tap((event) => Effect.when(listening.connected, Effect.succeed(event.type === "connected"))),
        Stream.filter(isMention),
        Stream.runForEach((event) => runs.hear(event.item)),
      );
    }),
  );
}

function isOffline(agent: string): (answer: PresenceResponse) => boolean {
  return ({ presence }) => !Arr.some(presence, ({ identity, online }) => identity === agent && online);
}

function untilOffline({ asAgent, listening }: Holding): Effect.Effect<void, CallFailure> {
  const offline = Effect.map(
    whileUnavailable(callClient((client) => client.presence())(asAgent)),
    isOffline(listening.registered.registration.agent),
  );
  const afterAPause = Effect.andThen(Effect.sleep(PRESENCE_POLL), offline);
  return Effect.asVoid(Effect.repeat(afterAPause, { until: Boolean }));
}

function newestOf(items: readonly InboxItem[], seen: Option.Option<MessageId>): Option.Option<MessageId> {
  const ids = [...Arr.map(items, ({ message }) => message.id), ...Option.toArray(seen)];
  return Arr.last(Arr.sort(ids, Order.Number));
}

function takenBack(holding: Holding): Effect.Effect<void, CallFailure> {
  const { agent } = holding.listening.registered.registration;
  return Effect.gen(function* takeAgentBack() {
    const { items } = yield* whileUnavailable(callClient((client) => client.inbox())(holding.asAgent));
    const seen = yield* holding.seen;
    const onConnected = Effect.andThen(printLine({ agent, type: "reconnected" }), holding.runs.catchUp);
    yield* heardUntilReplaced({ from: newestOf(items, seen), holding, onConnected });
  });
}

function isReplaced(failure: CallFailure): boolean {
  return failure.code === watchReplaced;
}

function whenReplaced(
  holding: Holding,
): (listen: Effect.Effect<void, CallFailure>) => Effect.Effect<void, CallFailure> {
  const { agent } = holding.listening.registered.registration;
  const standDown = Effect.andThen(
    holding.runs.standDown,
    Effect.andThen(printLine({ agent, type: "watch-replaced" }), untilOffline(holding)),
  );
  function standingDown(listen: Effect.Effect<void, CallFailure>): Effect.Effect<void, CallFailure> {
    return Effect.catchIf(listen, isReplaced, () => Effect.andThen(standDown, standingDown(takenBack(holding))));
  }
  return standingDown;
}

function wakeOnMentions(listening: Listening): Effect.Effect<void, CallFailure, Scope.Scope | Spawner> {
  return Effect.gen(function* listenAndWake() {
    const asAgent = yield* opened(listening.registered);
    const { place, registered } = listening;
    const runs = yield* wakeQueue({ asAgent, place, registration: registered.registration });
    const lastSeen = yield* Ref.make(Option.none<MessageId>());
    const holding: Holding = {
      asAgent,
      listening,
      runs,
      saw: (event) => Ref.update(lastSeen, lastSeenAfter(event)),
      seen: Ref.get(lastSeen),
    };
    yield* heardUntilReplaced({ from: Option.none(), holding, onConnected: runs.catchUp }).pipe(whenReplaced(holding));
  });
}

export { type Listening, wakeOnMentions };
