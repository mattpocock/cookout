import { Array as Arr, Effect } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, Message } from "../../index.ts";
import { TestCookout, answer, messageId, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

const MISSING = 999_999;
const NOT_FOUND = 404;

interface Posted {
  readonly first: Message;
  readonly second: Message;
  readonly third: Message;
}

function postToBob(ann: CookoutClient, bob: CookoutClient): Effect.Effect<Posted> {
  return Effect.gen(function* postThree() {
    yield* answer(() => ann.createChannel({ name: "grill" }));
    yield* answer(() => bob.subscribe("grill"));
    const { message: first } = yield* answer(() => ann.createMessage({ channel: "grill", text: "first" }));
    const { message: second } = yield* answer(() => ann.createMessage({ channel: "grill", text: "second" }));
    const { message: third } = yield* answer(() => ann.createMessage({ channel: "grill", text: "third" }));
    yield* answer(() => bob.ack(third.id));
    return { first, second, third };
  });
}

function unreadIds(client: CookoutClient): Effect.Effect<readonly number[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ items }) => Arr.map(items, (item) => item.message.id),
  );
}

function watching(client: CookoutClient): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

it.effect("marking a message unread moves the read position back to just before it", () =>
  Effect.gen(function* markUnread() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { first, second, third } = yield* postToBob(ann.client, bob.client);

    const { readPosition } = yield* answer(() => bob.client.markUnread(second.id));
    const unread = yield* unreadIds(bob.client);

    expect({ readPosition, unread }).toStrictEqual({
      readPosition: { channel: "grill", messageId: first.id, thread: null },
      unread: [second.id, third.id],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an ack after marking a message unread moves the read position forward again", () =>
  Effect.gen(function* ackAgain() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { second, third } = yield* postToBob(ann.client, bob.client);
    yield* answer(() => bob.client.markUnread(second.id));

    const { readPosition } = yield* answer(() => bob.client.ack(third.id));
    const unread = yield* unreadIds(bob.client);

    expect({ readPosition, unread }).toStrictEqual({
      readPosition: { channel: "grill", messageId: third.id, thread: null },
      unread: [],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("marking a message unread reaches the identity's open stream as a read-position-moved-back event", () =>
  Effect.gen(function* reachesStream() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { second } = yield* postToBob(ann.client, bob.client);
    const events = yield* watching(bob.client);

    const { readPosition } = yield* answer(() => bob.client.markUnread(second.id));
    const event = yield* answer(() => events.next());

    expect(event.value).toStrictEqual({ readPosition, type: "read-position-moved-back" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("marking a missing message unread is refused as message_not_found", () =>
  Effect.gen(function* missing() {
    const cookout = yield* TestCookout;
    const bob = yield* cookout.createIdentity("bob");

    const refused = yield* refusal(() => bob.client.markUnread(messageId(MISSING)));

    expect({ code: refused.code, status: refused.status }).toStrictEqual({
      code: "message_not_found",
      status: NOT_FOUND,
    });
  }).pipe(Effect.provide(testCookout())),
);
