import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import type { TestCookoutService } from "../../../testing/server.ts";

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const ONE_CALL = 1;
const SIX_CALLS = 6;
const UNAVAILABLE = 503;
const STEPS = 12;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };

it.effect("an admin deletes a channel, and its messages, threads and inbox items go with it", () =>
  Effect.gen(function* deleteChannel() {
    const cookout = yield* TestCookout;
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    yield* answer(() => cookout.client.createChannel({ description: "Grill it", name: "grill" }));
    yield* answer(() => bob.client.subscribe("grill"));
    const { message } = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "@bob look" }));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", replyTo: message.id, text: "and this" }));
    const deleted = yield* answer(() => cookout.client.deleteChannel("grill"));
    const after = yield* Effect.all(
      {
        channel: refusal(() => cookout.client.getChannel("grill")),
        inbox: answer(bob.client.inbox),
        list: answer(cookout.client.listChannels),
        messages: refusal(() => cookout.client.listMessages("grill")),
        thread: refusal(() => cookout.client.getThread(message.id)),
      },
      ONE_AT_A_TIME,
    );

    expect(deleted).toMatchObject({ channel: { description: "Grill it", name: "grill" } });
    expect(after).toMatchObject({
      channel: { code: "channel_not_found", status: NOT_FOUND },
      inbox: { items: [] },
      list: { channels: [] },
      messages: { code: "channel_not_found", status: NOT_FOUND },
      thread: { status: NOT_FOUND },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a non-admin can't delete a channel (403 admin_only), and the channel stays", () =>
  Effect.gen(function* nonAdmin() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    yield* answer(() => agent.client.createChannel({ name: "grill" }));
    const refused = yield* refusal(() => agent.client.deleteChannel("grill"));
    const kept = yield* answer(() => agent.client.getChannel("grill"));

    expect(refused).toMatchObject({ code: "admin_only", status: FORBIDDEN });
    expect(kept).toMatchObject({ channel: { name: "grill" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a channel that doesn't exist is refused with 404 channel_not_found", () =>
  Effect.gen(function* deleteMissing() {
    const cookout = yield* TestCookout;
    const missing = yield* refusal(() => cookout.client.deleteChannel("nowhere"));
    const malformed = yield* refusal(() => cookout.client.deleteChannel("Not A Channel"));
    const notFound = { code: "channel_not_found", status: NOT_FOUND };

    expect([missing, malformed]).toMatchObject([notFound, notFound]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a deleted channel's name can be created again, as a new, empty channel", () =>
  Effect.gen(function* createAgain() {
    const cookout = yield* TestCookout;
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "old" }));
    yield* answer(() => cookout.client.deleteChannel("grill"));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const page = yield* answer(() => cookout.client.listMessages("grill"));

    expect(page).toStrictEqual({ hasMore: false, messages: [], receipts: [] });
  }).pipe(Effect.provide(testCookout())),
);

function calledDeploy(cookout: TestCookoutService): Effect.Effect<void> {
  return Effect.gen(function* callDeploy() {
    yield* answer(() => cookout.client.addCommand({ name: "deploy", schema, url: `${cookout.webhook.url}/deploy` }));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.callCommand("deploy", { channel: "grill", data: { branch: "main" } }));
  });
}

it.effect("a pending webhook retry for a call in a deleted channel stops: the handler isn't called again", () =>
  Effect.gen(function* retryStops() {
    const cookout = yield* TestCookout;
    yield* cookout.webhook.failNext(SIX_CALLS, UNAVAILABLE);
    yield* calledDeploy(cookout);
    yield* cookout.webhook.waitForCalls(ONE_CALL);
    yield* answer(() => cookout.client.deleteChannel("grill"));
    const step = Effect.andThen(TestClock.adjust("1 hour"), TestClock.withLive(Effect.sleep("5 millis")));
    yield* Effect.repeat(step, { times: STEPS });
    const calls = yield* cookout.webhook.calls;

    expect(calls).toMatchObject([{ path: "/deploy", status: UNAVAILABLE }]);
  }).pipe(Effect.provide(testCookout({ webhookTimeoutSeconds: 86_400 }))),
);
