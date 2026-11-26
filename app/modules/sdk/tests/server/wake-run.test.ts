import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const NOT_FOUND = { code: "not_found", status: 404 } as const;

it.effect("a wake run can't start or end without a live connection opened as a runner", () =>
  Effect.gen(function* noRunner() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("brigid");
    yield* Effect.acquireRelease(
      answer(() => agent.client.watch()),
      (events) => answer(() => events.close()),
    );
    const started = yield* refusal(() => agent.client.startWakeRun());
    const ended = yield* refusal(() => agent.client.endWakeRun());

    expect(started).toMatchObject(NOT_FOUND);
    expect(ended).toMatchObject(NOT_FOUND);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a runner's wake run starts and ends, answering whether one is in progress", () =>
  Effect.gen(function* runnerSays() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("brigid");
    yield* Effect.acquireRelease(
      answer(() => agent.client.watch({ runner: true })),
      (events) => answer(() => events.close()),
    );
    const started = yield* answer(() => agent.client.startWakeRun());
    const ended = yield* answer(() => agent.client.endWakeRun());

    expect([started, ended]).toStrictEqual([{ wakeRun: true }, { wakeRun: false }]);
  }).pipe(Effect.provide(testCookout())),
);
