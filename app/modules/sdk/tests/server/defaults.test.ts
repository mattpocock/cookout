import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";
import { createCookoutClient } from "../../index.ts";

it.effect("the SDK defaults its URL and token to COOKOUT_URL and COOKOUT_TOKEN", () =>
  Effect.gen(function* envDefaults() {
    const cookout = yield* TestCookout;
    const client = createCookoutClient({ env: { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url } });
    const whoami = yield* answer(client.whoami);

    expect(whoami.identity).toMatchObject({ name: "admin" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("in a browser, with no process, the SDK reads no environment and uses the URL and token it is given", () =>
  Effect.gen(function* noProcess() {
    const cookout = yield* TestCookout;
    const client = yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        vi.stubGlobal("process", {});
        Reflect.deleteProperty(globalThis, "process");
      }),
      () => Effect.sync(() => createCookoutClient({ token: cookout.adminSession, url: cookout.url })),
      () => Effect.sync(() => vi.unstubAllGlobals()),
    );
    const whoami = yield* answer(client.whoami);

    expect(whoami.identity).toMatchObject({ name: "admin" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an empty COOKOUT_TOKEN counts as no token", () =>
  Effect.gen(function* emptyToken() {
    const cookout = yield* TestCookout;
    const client = createCookoutClient({ env: { COOKOUT_TOKEN: "", COOKOUT_URL: cookout.url } });
    const error = yield* refusal(client.whoami);

    expect(error).toMatchObject({ code: "token_missing", status: 401 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "the SDK sends COOKOUT_SESSION, an agent session token, when COOKOUT_TOKEN is unset, and COOKOUT_TOKEN wins",
  () =>
    Effect.gen(function* sessionDefault() {
      const cookout = yield* TestCookout;
      const aide = yield* cookout.createIdentity("release-bot");
      const other = yield* cookout.createIdentity("other");
      const { agentSessionToken } = yield* answer(() => aide.client.join({ as: "release-bot" }));
      const fromSession = createCookoutClient({
        env: { COOKOUT_SESSION: agentSessionToken, COOKOUT_URL: cookout.url },
      });
      const fromToken = createCookoutClient({
        env: { COOKOUT_SESSION: agentSessionToken, COOKOUT_TOKEN: other.token, COOKOUT_URL: cookout.url },
      });
      const answers = yield* Effect.all([answer(fromSession.whoami), answer(fromToken.whoami)], { concurrency: 1 });

      expect(answers).toMatchObject([{ identity: { name: "release-bot" } }, { identity: { name: "other" } }]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "inside a harness, the SDK sends COOKOUT_SESSION over COOKOUT_TOKEN, and COOKOUT_TOKEN alone still works",
  () =>
    Effect.gen(function* sessionInHarness() {
      const cookout = yield* TestCookout;
      const aide = yield* cookout.createIdentity("release-bot");
      const other = yield* cookout.createIdentity("other");
      const { agentSessionToken } = yield* answer(() => aide.client.join({ as: "release-bot" }));
      const harness = { CLAUDECODE: "1", COOKOUT_TOKEN: other.token, COOKOUT_URL: cookout.url };
      const fromSession = createCookoutClient({ env: { ...harness, COOKOUT_SESSION: agentSessionToken } });
      const fromToken = createCookoutClient({ env: harness });
      const answers = yield* Effect.all([answer(fromSession.whoami), answer(fromToken.whoami)], { concurrency: 1 });

      expect(answers).toMatchObject([{ identity: { name: "release-bot" } }, { identity: { name: "other" } }]);
    }).pipe(Effect.provide(testCookout())),
);
