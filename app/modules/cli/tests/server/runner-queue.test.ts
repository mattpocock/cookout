import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";
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
  mentions,
  repliesTo,
  startRunner,
  startsIn,
  testCookout,
  wakeBoard,
  wakeLog,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";

interface Woken {
  readonly joined: BoardAgent;
  readonly log: string;
  readonly on: WakeBoard;
  readonly runner: StartedRunner;
}

interface MidRun extends Woken {
  readonly first: MessageId;
  readonly release: Effect.Effect<void>;
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

const ONE_LINE = 1;
const TWO_LINES = 2;
const THREE_LINES = 3;
const FIVE_LINES = 5;
const isWakeRun = Schema.is(Schema.Struct({ type: Schema.Literal("wake-run") }));

function wakingBrigid(settings: Omit<FakeWakeSettings, "log">): Effect.Effect<Omit<Woken, "runner">, never, Needs> {
  return Effect.gen(function* joinBrigid() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const log = path.join(on.folder, "wake.log");
    const joined = yield* joinWaking({ name: "brigid", on, settings: { ...settings, log } });
    return { joined, log, on };
  });
}

function brigidRunning(settings: Omit<FakeWakeSettings, "log">): Effect.Effect<Woken, never, Needs> {
  return Effect.gen(function* startBrigid() {
    const woken = yield* wakingBrigid(settings);
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: woken.on.folder });
    return { ...woken, runner };
  });
}

function brigidMidRun(settings: Omit<FakeWakeSettings, "log" | "waitFor">): Effect.Effect<MidRun, never, Needs> {
  return Effect.gen(function* startFirstRun() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const log = path.join(on.folder, "wake.log");
    const release = path.join(on.folder, "release");
    const joined = yield* joinWaking({ name: "brigid", on, settings: { ...settings, log, waitFor: release } });
    const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
    const first = yield* mention({ ada: on.ada, text: "@brigid first" });
    return { first, joined, log, on, release: Effect.orDie(fs.writeFileString(release, "go")), runner };
  });
}

function wakeRunsIn(lines: readonly unknown[]): readonly unknown[] {
  return Arr.filter(lines, isWakeRun);
}

it.effect("two quick mentions each get exactly one answer from an agent that answers and acks its stdin", () =>
  Effect.gen(function* noDuplicates() {
    const { first, log, on, release, runner } = yield* brigidMidRun({ ack: true, sdkReply: "answered" });
    const second = yield* mention({ ada: on.ada, text: "@brigid second" });
    const waiting = yield* runner.stdoutLines(ONE_LINE);
    const lines = yield* Effect.andThen(release, runner.stdoutLines(THREE_LINES));
    const replies = yield* Effect.forEach([first, second], (id) => repliesTo({ ada: on.ada, id }), { concurrency: 1 });
    const starts = yield* Effect.map(wakeLog(log), startsIn);

    expect(waiting).toStrictEqual([{ agent: "brigid", message: second, type: "mention-waiting" }]);
    expect(wakeRunsIn(lines)).toMatchObject([{ messages: [first] }, { messages: [second] }]);
    expect(replies).toStrictEqual([["brigid: answered"], ["brigid: answered"]]);
    expect(starts).toStrictEqual([[first], [second]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("mentions heard during a wake run go to the next run together, in one inbox on stdin", () =>
  Effect.gen(function* batched() {
    const { first, log, on, release, runner } = yield* brigidMidRun({ ack: true });
    const later = yield* mentions({ ada: on.ada, texts: ["@brigid two", "@brigid three", "@brigid four"] });
    const waiting = yield* runner.stdoutLines(THREE_LINES);
    const lines = yield* Effect.andThen(release, runner.stdoutLines(FIVE_LINES));
    const runs = yield* wakeLog(log);

    expect(waiting).toStrictEqual(Arr.map(later, (message) => ({ agent: "brigid", message, type: "mention-waiting" })));
    expect(Arr.drop(lines, THREE_LINES)).toStrictEqual([
      { agent: "brigid", exitCode: 0, messages: [first], type: "wake-run" },
      { agent: "brigid", exitCode: 0, messages: later, type: "wake-run" },
    ]);
    expect(startsIn(runs)).toStrictEqual([[first], later]);
    expect(Arr.filter(runs, ({ event }) => event === "start")).toMatchObject([
      { inbox: { items: [{ message: { id: first } }] } },
      { inbox: { items: Arr.map(later, (id) => ({ message: { id }, reasons: ["mention"] })) } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a queued run whose mentions were all acked in the meantime doesn't start", () =>
  Effect.gen(function* skipped() {
    const { first, joined, log, on, release, runner } = yield* brigidMidRun({ ack: true });
    const second = yield* mention({ ada: on.ada, text: "@brigid answered elsewhere" });
    yield* runner.stdoutLines(ONE_LINE);
    yield* answer(() => joined.agent.client.ack(second));
    const lines = yield* Effect.andThen(release, runner.stdoutLines(THREE_LINES));
    const starts = yield* Effect.map(wakeLog(log), startsIn);

    expect(Arr.drop(lines, ONE_LINE)).toStrictEqual([
      { agent: "brigid", exitCode: 0, messages: [first], type: "wake-run" },
      { agent: "brigid", messages: [second], type: "wake-skipped" },
    ]);
    expect(starts).toStrictEqual([[first]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a mention the woken agent never acks wakes it once more, then never again", () =>
  Effect.gen(function* retriedOnce() {
    const { log, on, runner } = yield* brigidRunning({});
    const first = yield* mention({ ada: on.ada, text: "@brigid never acked" });
    yield* runner.stdoutLines(TWO_LINES);
    const second = yield* mention({ ada: on.ada, text: "@brigid also never acked" });
    const lines = yield* runner.stdoutLines(THREE_LINES);
    const starts = yield* Effect.map(wakeLog(log), startsIn);

    expect(lines).toMatchObject([
      { messages: [first], type: "wake-run" },
      { messages: [first], type: "wake-run" },
      { messages: [second], type: "wake-run" },
    ]);
    expect(Arr.take(starts, THREE_LINES)).toStrictEqual([[first], [first], [second]]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect.each([
  { how: "a mention", texts: ["@brigid while you were away"] },
  { how: "several mentions", texts: ["@brigid one", "@brigid two", "@brigid three"] },
])(
  "$how posted while the runner was stopped wake the agent in one run when it starts",
  ({ texts }: { readonly texts: readonly string[] }) =>
    Effect.gen(function* caughtUp() {
      const { log, on } = yield* wakingBrigid({ ack: true });
      const posted = yield* mentions({ ada: on.ada, texts });
      const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder });
      const lines = yield* runner.stdoutLines(ONE_LINE);
      const after = yield* mention({ ada: on.ada, text: "@brigid after catching up" });
      const next = yield* runner.stdoutLines(TWO_LINES);
      const starts = yield* Effect.map(wakeLog(log), startsIn);

      expect(lines).toStrictEqual([{ agent: "brigid", exitCode: 0, messages: posted, type: "wake-run" }]);
      expect(Arr.drop(next, ONE_LINE)).toMatchObject([{ messages: [after], type: "wake-run" }]);
      expect(starts).toStrictEqual([posted, [after]]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
