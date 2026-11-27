import type { CommandLineNeeds, TestCookoutService } from "../../../testing/server.ts";
import { Effect, Layer } from "effect";
import {
  TestCookout,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
  watchCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

interface Board {
  readonly cookout: TestCookoutService;
  readonly env: Readonly<Record<string, string>>;
}

const ONE_LINE = 1;
const EXIT_SUCCESS = 0;
const SETTLE = "30 millis";
const ALMOST_NINETY_DAYS = "7775999 seconds";
const LAST_SECOND = "1 second";
const TEXT = "@ada/scout was deactivated after 90 days with no activity.";

const services = Layer.merge(testCookout(), commandLineServices);

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

const adaOwnsAQuietAgent: Effect.Effect<Board, never, TestCookout | CommandLineNeeds | Scope.Scope> = Effect.gen(
  function* adaOwnsAnAgent() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { credential: "identity token", kind: "human" });
    yield* cookout.createIdentity("ada/scout", { owner: "ada" });
    const folder = yield* freshStateFolder;
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    yield* Effect.andThen(settled, TestClock.adjust(ALMOST_NINETY_DAYS));
    return { cookout, env };
  },
);

const lastQuietSecond: Effect.Effect<void> = Effect.andThen(
  Effect.andThen(settled, TestClock.adjust(LAST_SECOND)),
  settled,
);

it.effect("cookout inbox prints an agent deactivated after 90 days with no activity", () =>
  Effect.gen(function* inboxEntry() {
    const { env } = yield* adaOwnsAQuietAgent;
    yield* lastQuietSecond;
    const listed = yield* runCookout({ args: ["inbox"], env });

    expect(listed).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { deactivatedQuietAgents: [{ identity: { name: "ada/scout" }, read: false, text: TEXT }] },
    });
  }).pipe(Effect.provide(services)),
);

it.effect("cookout watch prints a line as the cookout deactivates a quiet agent", () =>
  Effect.gen(function* watchEntry() {
    const { env } = yield* adaOwnsAQuietAgent;
    const { stdoutLines } = yield* watchCookout({
      args: ["watch"],
      env,
      lines: ONE_LINE,
      whileWatching: lastQuietSecond,
    });

    expect(stdoutLines).toStrictEqual([
      `${TEXT} Run cookout identity reactivate ada/scout to undo it. (deactivated agent 1)`,
    ]);
  }).pipe(Effect.provide(services)),
);
