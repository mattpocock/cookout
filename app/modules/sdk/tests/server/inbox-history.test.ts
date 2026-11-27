import { Array as Arr, Effect, Option, pipe } from "effect";
import type { InboxHistoryItem, MessageId } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const BAD_REQUEST = 400;
const TOO_FEW = 0;
const TOO_MANY = 201;
const BEFORE_FIRST = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const BOOT = "2026-01-01T00:00:00.000Z";

interface Board {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* annAndBob() {
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    return { ann, bob };
  });
}

function post(who: TestIdentity, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => who.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

function listed(items: readonly InboxHistoryItem[]): unknown {
  return Arr.map(items, (item) => [item.message.id, item.reasons, item.read]);
}

it.effect("the inbox history lists read and unread items newest first, with their channel and thread", () =>
  Effect.gen(function* historyReadAndUnread() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob first" }));
    const second = yield* post(ann, "@bob second");
    yield* answer(() => bob.client.ack(message.id));
    const history = yield* answer(() => bob.client.inboxHistory());
    const { items } = yield* answer(() => bob.client.inbox());
    const oldest = Arr.last(history.items);

    expect([history.hasMore, listed(history.items), Arr.map(items, (item) => item.message.id)]).toStrictEqual([
      false,
      [
        [second, ["mention"], false],
        [message.id, ["mention"], true],
      ],
      [second],
    ]);
    expect(oldest).toStrictEqual(
      Option.some({
        channel: { createdAt: BOOT, name: "grill" },
        message,
        parent: message,
        read: true,
        reasons: ["mention"],
      }),
    );
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the inbox history pages back with before and limit", () =>
  Effect.gen(function* historyPages() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const first = yield* post(ann, "@bob one");
    const second = yield* post(ann, "@bob two");
    const newest = yield* answer(() => bob.client.inboxHistory({ limit: 1 }));
    const older = yield* answer(() => bob.client.inboxHistory({ before: second, limit: 1 }));

    expect([listed(newest.items), newest.hasMore]).toStrictEqual([[[second, ["mention"], false]], true]);
    expect([listed(older.items), older.hasMore]).toStrictEqual([[[first, ["mention"], false]], false]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a bad inbox history cursor or limit is refused with 400", () =>
  Effect.gen(function* badHistoryQuery() {
    const cookout = yield* TestCookout;
    const { bob } = yield* board(cookout);
    const refused = yield* pipe(
      [{ limit: TOO_FEW }, { limit: TOO_MANY }, { before: BEFORE_FIRST }] as const,
      Effect.forEach((query) => refusal(() => bob.client.inboxHistory(query)), ONE_AT_A_TIME),
    );
    const invalid = { code: "invalid_request", status: BAD_REQUEST };

    expect(refused).toMatchObject([invalid, invalid, invalid]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the inbox history lists a reaction item with every other identity's reaction, read once acked", () =>
  Effect.gen(function* historyWithReactions() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const own = yield* post(ann, "ship it?");
    yield* answer(() => bob.client.react(own, "thumbs_up"));
    const mention = yield* post(bob, "@ann shipped");
    yield* answer(() => ann.client.ack(mention));
    const { items } = yield* answer(() => ann.client.inboxHistory());

    expect(
      Arr.map(items, (item) => [item.message.id, item.reasons, item.read, item.newReactions ?? "none"]),
    ).toMatchObject([
      [mention, ["mention", "subscribed-channel"], true, "none"],
      [own, ["reaction"], true, [{ identity: "bob", messageId: own, reaction: "thumbs_up" }]],
    ]);
  }).pipe(Effect.provide(testCookout())),
);
