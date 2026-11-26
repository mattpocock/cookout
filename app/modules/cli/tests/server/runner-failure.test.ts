import { Array as Arr, Duration, Effect, FileSystem, Option, Path, Predicate, Schedule, Schema } from "effect";
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
  registrationIn,
  repliesTo,
  startRunner,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Presence } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

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
const DEATH_POLLS = 250;
const JUST_BEFORE_DEFAULT = 9;
const SEQUENTIAL = { concurrency: 1 } as const;
const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function brigidWaking({
  settings,
  timeoutMinutes,
}: {
  readonly settings: (folder: string) => Omit<FakeWakeSettings, "log">;
  readonly timeoutMinutes?: number;
}): Effect.Effect<Woken, never, Needs> {
  return Effect.gen(function* startBrigid() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const log = path.join(on.folder, "wake.log");
    const joined = yield* joinWaking({ name: AGENT, on, settings: { ...settings(on.folder), log }, timeoutMinutes });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    return { folder: on.folder, joined, on, runner };
  });
}

function live<Value, Needed>(effect: Effect.Effect<Value, never, Needed>): Effect.Effect<Value, never, Needed> {
  return TestClock.withLive(effect);
}

function untilExists(file: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  const exists = Effect.orDie(Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(file)));
  return live(Effect.asVoid(Effect.repeat(exists, { schedule: POLL, until: (found) => found })));
}

function childPid(folder: string): Effect.Effect<number, never, FileSystem.FileSystem> {
  return Effect.gen(function* readChildPid() {
    const fs = yield* FileSystem.FileSystem;
    const file = `${folder}/child.pid`;
    yield* untilExists(file);
    const text = yield* Effect.orDie(fs.readFileString(file));
    return Number(text);
  });
}

function fixed(folder: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.writeFileString(`${folder}/fixed`, "yes")));
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
      Arr.map(alerts, ({ backOnlineAt, offlineReason }) => ({
        back: Predicate.isNotUndefined(backOnlineAt),
        reason: offlineReason,
      })),
  );
}

function isAlive(pid: number): Effect.Effect<boolean, never, FileSystem.FileSystem> {
  return Effect.gen(function* checkProcess() {
    const fs = yield* FileSystem.FileSystem;
    const stat = yield* Effect.option(fs.readFileString(`/proc/${String(pid)}/stat`));
    return Option.exists(stat, (text) => !/^\d+ \(.*\) Z /u.test(text));
  });
}

function untilDead(pid: number): Effect.Effect<boolean, never, FileSystem.FileSystem> {
  return live(Effect.repeat(isAlive(pid), { schedule: POLL, times: DEATH_POLLS, until: (alive) => !alive }));
}

function stdoutAfter(stdoutNow: Effect.Effect<readonly unknown[]>, minutes: number): Effect.Effect<readonly unknown[]> {
  return Effect.gen(function* advanceAndRead() {
    yield* TestClock.adjust(Duration.minutes(minutes));
    yield* live(Effect.sleep("200 millis"));
    return yield* stdoutNow;
  });
}

it.effect("a run that outlives its timeout is killed with its children, and its thread hears that it timed out", () =>
  Effect.gen(function* timesOut() {
    const { folder, on, runner } = yield* brigidWaking({
      settings: (dir) => ({ childPidFile: `${dir}/child.pid`, hang: true }),
      timeoutMinutes: 2,
    });
    const first = yield* mention({ ada: on.ada, text: "@brigid hang" });
    const pid = yield* childPid(folder);
    const before = yield* isAlive(pid);
    yield* TestClock.adjust("2 minutes");
    const [lines, after, replies] = yield* Effect.all(
      [runner.stdoutLines(ONE_LINE), untilDead(pid), repliesUntil(on, first, ONE_LINE)],
      SEQUENTIAL,
    );

    expect({ after, before }).toStrictEqual({ after: false, before: true });
    expect(lines).toStrictEqual([{ agent: AGENT, messages: [first], timedOutAfterMinutes: 2, type: "wake-run" }]);
    expect(replies).toStrictEqual([`${AGENT}: My wake run timed out after 2 min.`]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

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

it.effect("a wake run's timeout is 10 minutes unless the registration gives its own", () =>
  Effect.gen(function* defaultTimeout() {
    const { folder, on, runner } = yield* brigidWaking({ settings: () => ({ ack: true, hang: true }) });
    const first = yield* mention({ ada: on.ada, text: "@brigid hang a while" });
    yield* live(
      Effect.repeat(
        answer(() => on.ada.client.getThread(first)),
        { schedule: POLL, times: 5 },
      ),
    );
    const early = yield* stdoutAfter(runner.stdoutNow, JUST_BEFORE_DEFAULT);
    yield* TestClock.adjust("1 minute");
    const lines = yield* runner.stdoutLines(ONE_LINE);
    const registered = yield* registrationIn(folder);

    expect(early).toStrictEqual([]);
    expect(lines).toMatchObject([{ messages: [first], timedOutAfterMinutes: 10 }]);
    expect(registered.content).not.toHaveProperty("timeoutMinutes");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("join --wake --timeout keeps the registration's own timeout", () =>
  Effect.gen(function* ownTimeout() {
    const { folder } = yield* brigidWaking({ settings: () => ({ ack: true }), timeoutMinutes: 45 });
    const registered = yield* registrationIn(folder);

    expect(registered.content).toMatchObject({ timeoutMinutes: 45 });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
