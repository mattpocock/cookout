import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const FORBIDDEN = 403;

it.effect("a person subscribes to a channel and its new top-level messages reach their inbox", () =>
  Effect.gen(function* personSubscribes() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const subscribed = yield* answer(() => ada.client.subscribe("grill"));
    const { message } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "news" }));
    const { items } = yield* answer(() => ada.client.inbox());

    expect(subscribed).toStrictEqual({ channel: "grill", subscribed: true });
    expect(items).toMatchObject([{ message: { id: message.id }, reasons: ["subscribed-channel"] }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent subscribing is refused with 403 identity_kind, and the channel's messages never reach it", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const refused = yield* refusal(() => bot.client.subscribe("grill"));
    yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "news" }));
    const listed = yield* answer(bot.client.listSubscribedChannels);
    const { items } = yield* answer(() => bot.client.inbox());

    expect(refused).toMatchObject({
      code: "identity_kind",
      message: "todo-bot is an agent; only people can subscribe to channels.",
      status: FORBIDDEN,
    });
    expect([listed, items]).toStrictEqual([{ channels: [] }, []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent that creates a channel isn't subscribed to it, and a person who creates one is", () =>
  Effect.gen(function* creatorsSubscribed() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    yield* answer(() => bot.client.createChannel({ name: "bot-room" }));
    yield* answer(() => ada.client.createChannel({ name: "ada-room" }));
    yield* answer(() => cookout.client.createMessage({ channel: "bot-room", text: "news" }));
    const listed = yield* Effect.all(
      { ada: answer(ada.client.listSubscribedChannels), bot: answer(bot.client.listSubscribedChannels) },
      { concurrency: 1 },
    );
    const { items } = yield* answer(() => bot.client.inbox());

    expect(listed).toMatchObject({ ada: { channels: [{ name: "ada-room" }] }, bot: { channels: [] } });
    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);
