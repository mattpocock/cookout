import { Array as Arr, Effect, Option, Order, Queue, Ref, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { InboxItem, MessageId } from "../../../sdk/index.ts";
import { lastSeenAfter, source, start, whileUnavailable } from "./watch-connection.ts";
import type { ChildProcessSpawner } from "effect/process";
import type { Heard } from "./watch-connection.ts";
import type { PresenceResponse } from "../../../presence/index.ts";
import type { RegisteredSession } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import { callClient } from "./adapters/sdk.ts";
import { opened } from "./registrations.ts";
import { printLine } from "./output.ts";
import { wakeRun } from "./wake-run.ts";
import { watchReplaced } from "../../../presence/index.ts";

const NONE_PENDING = 0;
const ONE = 1;
const PRESENCE_POLL = "5 seconds";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

function moreOne(count: number): number {
  return count + ONE;
}

function lessOne(count: number): number {
  return count - ONE;
}

function isMention(event: Readonly<Heard>): event is Extract<Heard, { readonly type: "inbox-item" }> {
  return event.type === "inbox-item" && Arr.contains(event.item.reasons, "mention");
}

interface Listening {
  readonly connected: Effect.Effect<boolean>;
  readonly place: RunPlace;
  readonly registered: RegisteredSession;
}

interface WakeRuns {
  readonly dropWaiting: Effect.Effect<void>;
  readonly hear: (item: InboxItem) => Effect.Effect<void>;
}

interface Holding {
  readonly asAgent: ClientWithAgentSessionState;
  readonly listening: Listening;
  readonly runs: WakeRuns;
  readonly saw: (event: Heard) => Effect.Effect<void>;
  readonly seen: Effect.Effect<Option.Option<MessageId>>;
}

interface Hearing {
  readonly from: Option.Option<MessageId>;
  readonly holding: Holding;
  readonly onConnected: Effect.Effect<void>;
}

function presenceDuring(
  asAgent: ClientWithAgentSessionState,
): (run: Effect.Effect<void, never, Spawner>) => Effect.Effect<void, never, Spawner> {
  const started = Effect.ignore(callClient((client) => client.startWakeRun())(asAgent));
  const ended = Effect.ignore(callClient((client) => client.endWakeRun())(asAgent));
  return (run) => Effect.andThen(started, Effect.ensuring(run, ended));
}

function oneAtATime(
  { place, registered }: Listening,
  asAgent: ClientWithAgentSessionState,
): Effect.Effect<WakeRuns, never, Scope.Scope | Spawner> {
  return Effect.gen(function* serialWakeRuns() {
    const { registration } = registered;
    const during = presenceDuring(asAgent);
    const waiting = yield* Queue.unbounded<InboxItem>();
    const pending = yield* Ref.make(NONE_PENDING);
    function runThenDone(item: InboxItem): Effect.Effect<void, never, Spawner> {
      return Effect.andThen(during(wakeRun({ item, place, registration })), Ref.update(pending, lessOne));
    }
    const runNext = Effect.flatMap(Queue.take(waiting), runThenDone);
    yield* Effect.forkScoped(Effect.forever(runNext));
    const dropWaiting = Effect.flatMap(Queue.clear(waiting), (dropped: readonly InboxItem[]) =>
      Ref.update(pending, (count) => count - dropped.length),
    );
    function hear(item: InboxItem): Effect.Effect<void> {
      return Effect.gen(function* queueWakeRun() {
        const before = yield* Ref.getAndUpdate(pending, moreOne);
        if (before > NONE_PENDING) {
          yield* printLine({ agent: registration.agent, message: item.message.id, type: "mention-waiting" });
        }
        yield* Queue.offer(waiting, item);
      });
    }
    return { dropWaiting, hear };
  });
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

function isUnreadMention(item: InboxItem): boolean {
  return Arr.contains(item.reasons, "mention");
}

function takenBack(holding: Holding): Effect.Effect<void, CallFailure> {
  const { agent } = holding.listening.registered.registration;
  return Effect.gen(function* takeAgentBack() {
    const { items } = yield* whileUnavailable(callClient((client) => client.inbox())(holding.asAgent));
    const seen = yield* holding.seen;
    const unread = Arr.findFirst(items, isUnreadMention);
    const wakeForUnread = Option.match(unread, { onNone: () => Effect.void, onSome: holding.runs.hear });
    const onConnected = Effect.andThen(printLine({ agent, type: "reconnected" }), wakeForUnread);
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
    holding.runs.dropWaiting,
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
    const runs = yield* oneAtATime(listening, asAgent);
    const lastSeen = yield* Ref.make(Option.none<MessageId>());
    const holding: Holding = {
      asAgent,
      listening,
      runs,
      saw: (event) => Ref.update(lastSeen, lastSeenAfter(event)),
      seen: Ref.get(lastSeen),
    };
    yield* heardUntilReplaced({ from: Option.none(), holding, onConnected: Effect.void }).pipe(whenReplaced(holding));
  });
}

export { type Listening, wakeOnMentions };
