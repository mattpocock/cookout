import {
  Array as Arr,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schedule,
  Schema,
  Stream,
} from "effect";
import type {
  BoardAgent,
  CommandLineNeeds,
  FakeWakeSettings,
  StartedRunner,
  TestCookout,
  WakeBoard,
} from "../../../testing/server.ts";
import {
  answer,
  commandLineServices,
  joinWaking,
  mention,
  registeredWithOldTimeout,
  repliesTo,
  startRunner,
  testCookout,
  wakeBoard,
  wakeEvents,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Presence } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { isOfflineAlert } from "../../../inbox/index.ts";

interface Woken {
  readonly folder: string;
  readonly joined: BoardAgent;
  readonly on: WakeBoard;
  readonly runner: StartedRunner;
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const AGENT = "brigid";
const SECRET = "COOKOUT_SECRET=sk-live-4f9a2c7e1b";
const POLL = Schedule.spaced("20 millis");
const ONE_LINE = 1;
const TWO_LINES = 2;
const THREE_LINES = 3;
const LONG_RUN_MINUTES = 60;
const OLD_TIMEOUT_MINUTES = 1;
const SEQUENTIAL = { concurrency: 1 } as const;
const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function brigidWaking({
  settings,
}: {
  readonly settings: (folder: string) => Omit<FakeWakeSettings, "log">;
}): Effect.Effect<Woken, never, Needs> {
  return Effect.gen(function* startBrigid() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const log = path.join(on.folder, "wake.log");
    const joined = yield* joinWaking({ name: AGENT, on, settings: { ...settings(on.folder), log } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    return { folder: on.folder, joined, on, runner };
  });
}

function live<Value, Needed>(effect: Effect.Effect<Value, never, Needed>): Effect.Effect<Value, never, Needed> {
  return TestClock.withLive(effect);
}

function onceFound<Found>(
  folder: string,
  look: Effect.Effect<Option.Option<Found>, never, FileSystem.FileSystem>,
): Effect.Effect<Found, never, FileSystem.FileSystem> {
  return Effect.gen(function* untilFound() {
    const fs = yield* FileSystem.FileSystem;
    const ready = yield* Deferred.make<boolean>();
    function onReady(): void {
      Deferred.doneUnsafe(ready, Effect.succeed(true));
    }
    const changes = Stream.merge(fs.watch(folder, { onReady }), Stream.fromEffect(Deferred.await(ready)));
    const found = yield* changes.pipe(
      Stream.mapEffect(() => look),
      Stream.filter(Option.isSome),
      Stream.runHead,
    );
    return Option.getOrThrow(Option.flatten(found));
  }).pipe(Effect.orDie);
}

function runStarted(folder: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  const log = `${folder}/wake.log`;
  const look = Effect.gen(function* startLogged() {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* Effect.orDie(fs.exists(log));
    if (!exists) {
      return Option.none();
    }
    const events = yield* wakeEvents(log);
    return Arr.findFirst(events, ([event]) => event === "start");
  });
  return Effect.asVoid(onceFound(folder, look));
}

function oncePastMinutes(folder: string, minutes: number): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.andThen(runStarted(folder), TestClock.adjust(Duration.minutes(minutes)));
}

function fixed(folder: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.writeFileString(`${folder}/fixed`, "yes")));
}

function finished(folder: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.writeFileString(`${folder}/finish`, "yes")));
}

function longRun(
  folder: string,
  runner: StartedRunner,
): Effect.Effect<
  { readonly during: readonly unknown[]; readonly lines: readonly unknown[] },
  never,
  FileSystem.FileSystem
> {
  return Effect.gen(function* runPastTheOldDefault() {
    yield* oncePastMinutes(folder, LONG_RUN_MINUTES);
    const during = yield* runner.stdoutNow;
    yield* finished(folder);
    const lines = yield* runner.stdoutLines(ONE_LINE);
    return { during, lines };
  });
}

function presenceNow(on: WakeBoard): Effect.Effect<Option.Option<Presence>> {
  return Effect.map(
    answer(() => on.ada.client.presence()),
    ({ presence }) => Arr.findFirst(presence, ({ identity }) => identity === AGENT),
  );
}

function presenceUntil(on: WakeBoard, until: (presence: Presence) => boolean): Effect.Effect<Presence> {
  const found = Effect.repeat(presenceNow(on), { schedule: POLL, until: Option.exists(until) });
  return live(Effect.map(found, Option.getOrThrow));
}

function isUnreachable(presence: Presence): boolean {
  return Predicate.isNotUndefined(presence.unreachable);
}

function repliesUntil(on: WakeBoard, id: MessageId, count: number): Effect.Effect<readonly string[]> {
  return live(Effect.repeat(repliesTo({ ada: on.ada, id }), { schedule: POLL, until: (all) => all.length >= count }));
}

function alertsOf(on: WakeBoard): Effect.Effect<readonly { readonly back: boolean; readonly reason: string }[]> {
  return Effect.map(
    answer(() => on.ada.client.inbox()),
    ({ alerts }) =>
      Arr.map(Arr.filter(alerts, isOfflineAlert), ({ backOnlineAt, offlineReason }) => ({
        back: Predicate.isNotUndefined(backOnlineAt),
        reason: offlineReason,
      })),
  );
}

it.effect("a run that exits 3 gets one reply naming exit 3, and nothing it printed reaches the board", () =>
  Effect.gen(function* exitsThree() {
    const { joined, on, runner } = yield* brigidWaking({ settings: () => ({ ack: true, exitCode: 3, print: SECRET }) });
    const first = yield* mention({ ada: on.ada, text: "@brigid fail" });
    const lines = yield* runner.stdoutLines(ONE_LINE);
    const replies = yield* repliesUntil(on, first, ONE_LINE);
    yield* presenceUntil(on, isUnreachable);
    const everything = yield* Effect.all(
      [
        answer(() => on.ada.client.listMessages("grill")),
        answer(() => on.ada.client.getThread(first)),
        answer(() => on.ada.client.presence()),
        answer(() => on.ada.client.inbox()),
        answer(() => joined.agent.client.inbox()),
      ],
      SEQUENTIAL,
    );
    const seen = yield* Effect.orDie(encode(everything));

    expect(lines).toStrictEqual([{ agent: AGENT, exitCode: 3, messages: [first], type: "wake-run" }]);
    expect(replies).toStrictEqual([`${AGENT}: My wake run exited 3.`]);
    expect(seen).not.toContain("sk-live-4f9a2c7e1b");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("failed runs make the agent Unreachable with one offline alert, and the next run exiting 0 clears both", () =>
  Effect.gen(function* unreachableThenBack() {
    const { folder, on, runner } = yield* brigidWaking({
      settings: (dir) => ({ exitCode: 1, succeedAfter: `${dir}/fixed` }),
    });
    const first = yield* mention({ ada: on.ada, text: "@brigid fail twice" });
    const [twice, failing, replies, streak] = yield* Effect.all(
      [
        runner.stdoutLines(TWO_LINES),
        presenceUntil(on, isUnreachable),
        repliesUntil(on, first, TWO_LINES),
        alertsOf(on),
      ],
      SEQUENTIAL,
    );
    yield* Effect.andThen(fixed(folder), mention({ ada: on.ada, text: "@brigid now work" }));
    const [, back, cleared] = yield* Effect.all(
      [runner.stdoutLines(THREE_LINES), presenceUntil(on, ({ online }) => online), alertsOf(on)],
      SEQUENTIAL,
    );

    expect(twice).toMatchObject([
      { exitCode: 1, messages: [first] },
      { exitCode: 1, messages: [first] },
    ]);
    expect(failing).toMatchObject({ online: false, unreachable: { error: "wake run exited 1", ok: false } });
    expect({ replies, streak }).toStrictEqual({
      replies: [`${AGENT}: My wake run exited 1.`, `${AGENT}: My wake run exited 1.`],
      streak: [{ back: false, reason: "wake run failed" }],
    });
    expect(back).toMatchObject({ online: true, wakesOnMention: true });
    expect({ cleared, unreachable: isUnreachable(back) }).toStrictEqual({
      cleared: [{ back: true, reason: "wake run failed" }],
      unreachable: false,
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a run longer than the old 10-minute default isn't killed, and ends when its process exits", () =>
  Effect.gen(function* noTimeout() {
    const { folder, on, runner } = yield* brigidWaking({
      settings: (dir) => ({ ack: true, waitFor: `${dir}/finish` }),
    });
    const first = yield* mention({ ada: on.ada, text: "@brigid take your time" });
    const { during, lines } = yield* longRun(folder, runner);

    expect(during).toStrictEqual([]);
    expect(lines).toStrictEqual([{ agent: AGENT, exitCode: 0, messages: [first], type: "wake-run" }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a registration an older CLI wrote with timeoutMinutes still loads, and the field is ignored", () =>
  Effect.gen(function* olderRegistration() {
    const on = yield* wakeBoard;
    const { folder } = on;
    const settings = { ack: true, log: `${folder}/wake.log`, waitFor: `${folder}/finish` };
    yield* joinWaking({ name: AGENT, on, settings });
    yield* registeredWithOldTimeout({ minutes: OLD_TIMEOUT_MINUTES, stateFolder: folder });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: folder });
    const first = yield* mention({ ada: on.ada, text: "@brigid old registration" });
    const { during, lines } = yield* longRun(folder, runner);

    expect(during).toStrictEqual([]);
    expect(lines).toStrictEqual([{ agent: AGENT, exitCode: 0, messages: [first], type: "wake-run" }]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
