import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { adminSessionOf, answer, commandLineServices, startDev } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { moveClockForward, testClient } from "../../../testing/index.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { DevProcess } from "../../../testing/server.ts";
import { clockForwardPath } from "../../../http/index.ts";

const NOT_FOUND = 404;
const QUIET_DAYS = 3;
const NONE = 0;

function statusOf(url: string): Effect.Effect<number> {
  return HttpClient.execute(HttpClientRequest.get(url)).pipe(
    Effect.map(({ status }) => status),
    Effect.provide(FetchHttpClient.layer),
    Effect.orDie,
  );
}

function threadStartedOn(dev: DevProcess): Effect.Effect<CookoutClient> {
  return Effect.gen(function* startThread() {
    const admin = testClient({ env: {}, token: yield* adminSessionOf(dev), url: dev.url });
    yield* answer(() => admin.createChannel({ name: "release" }));
    const { token } = yield* answer(() => admin.createIdentity({ kind: "human", name: "ada" }));
    const ada = testClient({ env: {}, token, url: dev.url });
    yield* answer(() => ada.createMessage({ channel: "release", text: "Who owns the release notes?" }));
    return ada;
  });
}

it.effect(
  "pnpm dev's clock moves forward when told, and the nudge job raises a nudge for a thread quiet that long",
  () =>
    Effect.gen(function* devClockMovesForward() {
      const dev = yield* startDev;
      const ada = yield* threadStartedOn(dev);
      const before = yield* answer(() => ada.inbox());
      yield* Effect.promise(() => moveClockForward({ clockUrl: dev.clockUrl, days: QUIET_DAYS }));
      const after = yield* Effect.repeat(
        answer(() => ada.inbox()),
        { until: ({ nudges }) => nudges.length > NONE },
      );

      expect(before.nudges).toStrictEqual([]);
      expect(Arr.map(after.nudges, ({ text }) => text)).toStrictEqual(["Quiet for 3 days: close it, or follow up?"]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev's clock refuses a move backwards, and answers 404 off its one path", () =>
  Effect.gen(function* devClockRefuses() {
    const dev = yield* startDev;
    const backwards = yield* Effect.flip(
      Effect.tryPromise({
        catch: String,
        try: () => moveClockForward({ clockUrl: dev.clockUrl, days: -1 }),
      }),
    );
    const elsewhere = yield* statusOf(`${dev.clockUrl}${clockForwardPath}`);

    expect(backwards).toContain("did not move forward");
    expect(elsewhere).toBe(NOT_FOUND);
  }).pipe(Effect.provide(commandLineServices)),
);
