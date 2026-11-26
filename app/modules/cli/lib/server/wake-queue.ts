import { Array as Arr, Effect, Order, Queue, Ref } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { InboxItem, MessageId } from "../../../sdk/index.ts";
import type { ChildProcessSpawner } from "effect/process";
import type { Registration } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import { callClient } from "./adapters/sdk.ts";
import { printLine } from "./output.ts";
import { wakeRun } from "./wake-run.ts";

const RUNS_PER_MENTION = 2;
const NONE = 0;
const ONE = 1;

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

interface Waiting {
  readonly queued: readonly InboxItem[];
  readonly runs: ReadonlyMap<MessageId, number>;
  readonly running: boolean;
}

interface Heard {
  readonly fresh: readonly InboxItem[];
  readonly running: boolean;
}

interface Waking {
  readonly asAgent: ClientWithAgentSessionState;
  readonly place: RunPlace;
  readonly registration: Registration;
}

interface WakeQueue {
  readonly catchUp: Effect.Effect<void, CallFailure>;
  readonly hear: (item: InboxItem) => Effect.Effect<void>;
}

const byMessage = Order.mapInput(Order.Number, (item: InboxItem): number => item.message.id);

function sameMessage(one: InboxItem, other: InboxItem): boolean {
  return one.message.id === other.message.id;
}

function idsOf(items: readonly InboxItem[]): readonly MessageId[] {
  return Arr.map(items, ({ message }) => message.id);
}

function isMention(item: InboxItem): boolean {
  return Arr.contains(item.reasons, "mention");
}

function runsOf(waiting: Waiting, id: MessageId): number {
  return waiting.runs.get(id) ?? NONE;
}

function withHeard(items: readonly InboxItem[]) {
  return (waiting: Waiting): readonly [Heard, Waiting] => {
    const known = new Set([...waiting.runs.keys(), ...idsOf(waiting.queued)]);
    const unknown = Arr.filter(items, ({ message }) => !known.has(message.id));
    const fresh = Arr.dedupeWith(unknown, sameMessage);
    return [
      { fresh, running: waiting.running },
      { ...waiting, queued: [...waiting.queued, ...fresh] },
    ];
  };
}

function withRun(given: readonly InboxItem[]) {
  return (waiting: Waiting): Waiting => {
    const counted = Arr.map(idsOf(given), (id) => [id, runsOf(waiting, id) + ONE] as const);
    return { ...waiting, runs: new Map([...waiting.runs, ...counted]) };
  };
}

function withRetried(unread: readonly InboxItem[]) {
  return (waiting: Waiting): Waiting => {
    const again = Arr.filter(unread, ({ message }) => runsOf(waiting, message.id) < RUNS_PER_MENTION);
    return { ...waiting, queued: [...again, ...waiting.queued] };
  };
}

function takeQueued(waiting: Waiting): readonly [readonly InboxItem[], Waiting] {
  return [waiting.queued, { ...waiting, queued: [], running: true }];
}

function doneRunning(waiting: Waiting): Waiting {
  return { ...waiting, running: false };
}

function inboxOf(asAgent: ClientWithAgentSessionState): Effect.Effect<readonly InboxItem[], CallFailure> {
  return Effect.map(callClient((client) => client.inbox())(asAgent), ({ items }) => items);
}

function unreadAmong(items: readonly InboxItem[]) {
  const ids = new Set(idsOf(items));
  return (inbox: readonly InboxItem[]): readonly InboxItem[] => {
    const unread = Arr.filter(inbox, ({ message }) => ids.has(message.id));
    return Arr.sort(Arr.dedupeWith(unread, sameMessage), byMessage);
  };
}

function stillUnread(
  asAgent: ClientWithAgentSessionState,
  items: readonly InboxItem[],
): Effect.Effect<readonly InboxItem[]> {
  return inboxOf(asAgent).pipe(
    Effect.map(unreadAmong(items)),
    Effect.orElseSucceed(() => items),
  );
}

function mentionsIn(items: readonly InboxItem[]): readonly InboxItem[] {
  return Arr.filter(items, isMention);
}

interface Queued extends Waking {
  readonly change: (next: (waiting: Waiting) => Waiting) => Effect.Effect<Waiting>;
  readonly take: Effect.Effect<readonly InboxItem[]>;
}

function runGiven({ asAgent, change, place, registration }: Queued) {
  return (given: readonly InboxItem[]): Effect.Effect<void, never, Spawner> =>
    Effect.gen(function* runAndRetry() {
      yield* change(withRun(given));
      yield* wakeRun({ items: given, place, registration });
      const unread = yield* stillUnread(asAgent, given);
      yield* change(withRetried(unread));
    });
}

function runOrSkip(queued: Queued) {
  return (items: readonly InboxItem[]): Effect.Effect<void, never, Spawner> =>
    Effect.flatMap(stillUnread(queued.asAgent, items), (unread) => {
      if (Arr.isReadonlyArrayNonEmpty(unread)) {
        return runGiven(queued)(unread);
      }
      return printLine({ agent: queued.registration.agent, messages: idsOf(items), type: "wake-skipped" });
    });
}

function nextRun(queued: Queued): Effect.Effect<boolean, never, Spawner> {
  return Effect.gen(function* runWhatIsQueued() {
    const items = yield* queued.take;
    yield* Effect.when(runOrSkip(queued)(items), Effect.succeed(Arr.isReadonlyArrayNonEmpty(items)));
    const { queued: left } = yield* queued.change(doneRunning);
    return Arr.isReadonlyArrayNonEmpty(left);
  });
}

function runUntilEmpty(queued: Queued): Effect.Effect<void, never, Spawner> {
  return Effect.flatMap(nextRun(queued), (more) => {
    if (more) {
      return runUntilEmpty(queued);
    }
    return Effect.void;
  });
}

function sayWaiting(agent: string) {
  return (message: MessageId): Effect.Effect<void> => printLine({ agent, message, type: "mention-waiting" });
}

function wakeQueue(waking: Waking): Effect.Effect<WakeQueue, never, Scope.Scope | Spawner> {
  return Effect.gen(function* serialWakeRuns() {
    const { agent } = waking.registration;
    const state = yield* Ref.make<Waiting>({ queued: [], running: false, runs: new Map() });
    const signal = yield* Queue.unbounded<true>();
    function hearAll(items: readonly InboxItem[]): Effect.Effect<void> {
      return Effect.gen(function* queueMentions() {
        const { fresh, running } = yield* Ref.modify(state, withHeard(items));
        const waiting = Effect.forEach(idsOf(fresh), sayWaiting(agent), { concurrency: 1, discard: true });
        yield* Effect.when(waiting, Effect.succeed(running));
        yield* Queue.offer(signal, true);
      });
    }
    function change(next: (waiting: Waiting) => Waiting): Effect.Effect<Waiting> {
      return Ref.updateAndGet(state, next);
    }
    const drain = runUntilEmpty({ ...waking, change, take: Ref.modify(state, takeQueued) });
    const nextSignal = Effect.andThen(Queue.take(signal), drain);
    yield* Effect.forkScoped(Effect.forever(nextSignal));
    const catchUp = Effect.flatMap(Effect.map(inboxOf(waking.asAgent), mentionsIn), hearAll);
    return { catchUp, hear: (item: InboxItem) => hearAll([item]) };
  });
}

export { wakeQueue };
