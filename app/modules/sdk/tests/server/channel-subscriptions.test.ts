import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

it.effect("an identity lists only its own subscribed channels, sorted by name, created ones included", () =>
  Effect.gen(function* subscribedChannels() {
    const cookout = yield* TestCookout;
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    yield* Effect.all(
      [
        answer(() => cookout.client.createChannel({ description: "Ops talk", name: "ops" })),
        answer(() => cookout.client.createChannel({ name: "grill" })),
        answer(() => cookout.client.createChannel({ name: "lounge" })),
        answer(() => bob.client.subscribe("ops")),
        answer(() => bob.client.subscribe("grill")),
      ],
      ONE_AT_A_TIME,
    );
    const listed = yield* Effect.all(
      {
        all: answer(bob.client.listChannels),
        bob: answer(bob.client.listSubscribedChannels),
        own: answer(cookout.client.listSubscribedChannels),
      },
      ONE_AT_A_TIME,
    );

    expect(listed).toMatchObject({
      all: { channels: [{ name: "grill" }, { name: "lounge" }, { name: "ops" }] },
      bob: { channels: [{ name: "grill" }, { description: "Ops talk", name: "ops" }] },
      own: { channels: [{ name: "grill" }, { name: "lounge" }, { name: "ops" }] },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("unsubscribing or deleting a channel takes it off the subscribed list", () =>
  Effect.gen(function* changing() {
    const cookout = yield* TestCookout;
    yield* Effect.all(
      [
        answer(() => cookout.client.createChannel({ name: "grill" })),
        answer(() => cookout.client.createChannel({ name: "lounge" })),
        answer(() => cookout.client.subscribe("grill")),
        answer(() => cookout.client.subscribe("lounge")),
        answer(() => cookout.client.unsubscribe("grill")),
      ],
      ONE_AT_A_TIME,
    );
    const afterUnsubscribe = yield* answer(cookout.client.listSubscribedChannels);
    yield* answer(() => cookout.client.deleteChannel("lounge"));
    const afterDelete = yield* answer(cookout.client.listSubscribedChannels);

    expect(afterUnsubscribe).toMatchObject({ channels: [{ name: "lounge" }] });
    expect(afterDelete).toStrictEqual({ channels: [] });
  }).pipe(Effect.provide(testCookout())),
);
