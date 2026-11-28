import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

function postAsAdmin(cookout: TestCookoutService): Effect.Effect<void> {
  return Effect.gen(function* postInGrill() {
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "lit the grill" }));
  });
}

it.effect("changing COOKOUT_ADMIN_NAME moves the token to the new name and leaves the old admin and its messages", () =>
  Effect.gen(function* renamedOnRestart() {
    const cookout = yield* TestCookout;
    yield* postAsAdmin(cookout);
    const second = yield* cookout.startSecondServerAs("matt");
    const client = createCookoutClient({ env: {}, token: second.settingToken, url: second.url });
    const whoami = yield* answer(client.whoami);
    const { identities } = yield* answer(client.listIdentities);
    const page = yield* answer(() => client.listMessages("grill"));

    expect(whoami.identity).toMatchObject({ admin: true, kind: "human", name: "matt" });
    expect(identities).toMatchObject([
      { admin: true, kind: "human", name: "admin" },
      { admin: true, kind: "human", name: "matt" },
    ]);
    expect(page.messages).toMatchObject([{ author: { name: "admin" }, text: "lit the grill" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("COOKOUT_ADMIN_NAME naming an existing human makes it an admin with the admin token as its only token", () =>
  Effect.gen(function* promotesHuman() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", { credential: "identity token", kind: "human" });
    const second = yield* cookout.startSecondServerAs("matt");
    const whoami = yield* answer(createCookoutClient({ env: {}, token: second.settingToken, url: second.url }).whoami);
    const old = yield* refusal(createCookoutClient({ env: {}, token: matt.token, url: second.url }).whoami);

    expect(whoami.identity).toMatchObject({ admin: true, kind: "human", name: "matt" });
    expect(old).toMatchObject({ code: "token_revoked", status: 401 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("COOKOUT_ADMIN_NAME naming an agent stops the server from starting", () =>
  Effect.gen(function* refusesAgent() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("release-bot", { owner: "matt" });
    const failure = yield* Effect.flip(cookout.startSecondServerAs("release-bot"));

    expect(failure).toMatchObject({ _tag: "AdminNameIsAgent", adminName: "release-bot" });
  }).pipe(Effect.provide(testCookout())),
);
