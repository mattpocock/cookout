import { Deferred, Effect, Fiber, Option, Queue, Ref } from "effect";
import type { ChildProcessSpawner } from "effect/process";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Registration } from "./registrations.ts";
import type { RunPlace } from "./wake-run.ts";
import type { Scope } from "effect";
import { printLine } from "./output.ts";
import { wakeRun } from "./wake-run.ts";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

type During = (run: Effect.Effect<void, never, Spawner>) => Effect.Effect<void, never, Spawner>;

interface WakeQueue {
  readonly hear: (item: InboxItem) => Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
}

interface Queueing {
  readonly during: During;
  readonly place: RunPlace;
  readonly registration: Registration;
}

const NONE_PENDING = 0;
const ONE = 1;

function moreOne(count: number): number {
  return count + ONE;
}

function lessOne(count: number): number {
  return count - ONE;
}

function isTrue(more: boolean): boolean {
  return more;
}

function wakeQueue({ during, place, registration }: Queueing): Effect.Effect<WakeQueue, never, Scope.Scope | Spawner> {
  return Effect.gen(function* serialWakeRuns() {
    const waiting = yield* Queue.unbounded<InboxItem>();
    const pending = yield* Ref.make(NONE_PENDING);
    const stopping = yield* Deferred.make<boolean>();
    const taken = Effect.raceFirst(
      Effect.asSome(Queue.take(waiting)),
      Effect.as(Deferred.await(stopping), Option.none<InboxItem>()),
    );
    const next = Effect.flatMap(Deferred.isDone(stopping), (stopped): Effect.Effect<Option.Option<InboxItem>> => {
      if (stopped) {
        return Effect.succeedNone;
      }
      return taken;
    });
    function runOne(item: InboxItem): Effect.Effect<boolean, never, Spawner> {
      const run = during(wakeRun({ item, place, registration }));
      return Effect.as(Effect.andThen(run, Ref.update(pending, lessOne)), true);
    }
    const runNext = Effect.flatMap(next, Option.match({ onNone: () => Effect.succeed(false), onSome: runOne }));
    const running = yield* Effect.forkScoped(Effect.repeat(runNext, { while: isTrue }));
    function hear(item: InboxItem): Effect.Effect<void> {
      return Effect.gen(function* queueWakeRun() {
        const before = yield* Ref.getAndUpdate(pending, moreOne);
        if (before > NONE_PENDING) {
          yield* printLine({ agent: registration.agent, message: item.message.id, type: "mention-waiting" });
        }
        yield* Queue.offer(waiting, item);
      });
    }
    return { hear, stop: Effect.andThen(Deferred.succeed(stopping, true), Effect.asVoid(Fiber.join(running))) };
  });
}

export { type During, type Spawner, type WakeQueue, wakeQueue };
