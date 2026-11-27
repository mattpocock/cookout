import { Array as Arr, Effect } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, Message } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

interface Posted {
  readonly parent: Message;
  readonly reply: Message;
  readonly mention: Message;
  readonly newest: Message;
}

function postToBob(ann: CookoutClient, bob: CookoutClient): Effect.Effect<Posted> {
  return Effect.gen(function* postAcrossChannelsAndThreads() {
    yield* answer(() => ann.createChannel({ name: "grill" }));
    yield* answer(() => ann.createChannel({ name: "ops" }));
    yield* answer(() => bob.subscribe("ops"));
    const { message: parent } = yield* answer(() => bob.createMessage({ channel: "grill", text: "parent" }));
    const { message: reply } = yield* answer(() =>
      ann.createMessage({ channel: "grill", replyTo: parent.id, text: "reply" }),
    );
    const { message: mention } = yield* answer(() => ann.createMessage({ channel: "grill", text: "@bob look" }));
    yield* answer(() => ann.createMessage({ channel: "ops", text: "deploy" }));
    const { message: newest } = yield* answer(() => ann.createMessage({ channel: "ops", text: "deployed" }));
    return { mention, newest, parent, reply };
  });
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

it.effect("acking all of the inbox reads every unread item across channels and threads", () =>
  Effect.gen(function* ackAllEmpties() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { mention, newest, parent, reply } = yield* postToBob(ann.client, bob.client);
    const before = yield* answer(() => bob.client.inbox());
    const { readPositions } = yield* answer(() => bob.client.ackAll(newest.id));
    const after = yield* answer(() => bob.client.inbox());

    expect({ after: after.items, before: before.items.length, readPositions }).toStrictEqual({
      after: [],
      before: 4,
      readPositions: [
        { channel: "grill", messageId: reply.id, thread: parent.id },
        { channel: "grill", messageId: mention.id, thread: null },
        { channel: "ops", messageId: newest.id, thread: null },
      ],
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a message that arrives after acking all of the inbox up to what was seen stays unread", () =>
  Effect.gen(function* laterStaysUnread() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { mention } = yield* postToBob(ann.client, bob.client);
    const { message: later } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob again" }));
    yield* answer(() => bob.client.ackAll(mention.id));
    const after = yield* answer(() => bob.client.inbox());
    const left = Arr.map(after.items, (item) => item.message.id);

    expect(left).toContain(later.id);
    expect(left).not.toContain(mention.id);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("acking all of the inbox reaches the identity's open stream as read-position events", () =>
  Effect.gen(function* ackAllReachesStream() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob", { kind: "human" });
    const { mention } = yield* postToBob(ann.client, bob.client);
    const events = yield* watching(bob.client);
    const { readPositions } = yield* answer(() => bob.client.ackAll(mention.id));
    const first = yield* answer(() => events.next());
    const second = yield* answer(() => events.next());

    expect([first.value, second.value]).toStrictEqual(
      Arr.map(readPositions, (readPosition) => ({ readPosition, type: "read-position" })),
    );
  }).pipe(Effect.provide(testCookout())),
);
