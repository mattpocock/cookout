import type { CookoutClient, CookoutEvent, EventStream, Message, WatchOptions } from "../../index.ts";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, freshToken, messageId, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

const NOT_FOUND = 404;
const MISSING = 999;
const BOOT = "2026-01-01T00:00:00.000Z";
const A_MINUTE_IN = "2026-01-01T00:01:00.000Z";

interface Board {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
  readonly cat: TestIdentity;
  readonly message: Message;
  readonly cookout: TestCookoutService;
}

const annPosts: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* annAndBobAndCat() {
  const cookout = yield* TestCookout;
  const ann = yield* cookout.createIdentity("ann");
  const bob = yield* cookout.createIdentity("bob");
  const cat = yield* cookout.createIdentity("cat");
  yield* answer(() => ann.client.createChannel({ name: "grill" }));
  const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "ship it?" }));
  return { ann, bob, cat, cookout, message };
});

function watching(
  client: CookoutClient,
  options?: WatchOptions,
): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch(options)),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function nextEvent(events: AsyncIterator<CookoutEvent>): Effect.Effect<IteratorResult<CookoutEvent>> {
  return answer(() => events.next());
}

function nextReaction(events: AsyncIterator<CookoutEvent>): Effect.Effect<IteratorResult<CookoutEvent>> {
  return Effect.repeat(nextEvent(events), {
    until: (next: Readonly<IteratorResult<CookoutEvent>>) => next.done === true || next.value.type === "reaction",
  });
}

function inboxOf(who: TestIdentity): Effect.Effect<readonly unknown[]> {
  return Effect.map(
    answer(() => who.client.inbox()),
    ({ items }) => items,
  );
}

it.effect("a reaction shows on its message in the thread and the channel page, with who left it", () =>
  Effect.gen(function* reactionShows() {
    const { bob, cat, message } = yield* annPosts;
    const first = yield* answer(() => bob.client.react(message.id, "thumbs_up"));
    yield* answer(() => cat.client.react(message.id, "thumbs_up"));
    yield* answer(() => bob.client.react(message.id, "thumbs_down"));
    const again = yield* answer(() => bob.client.react(message.id, "thumbs_up"));
    const thread = yield* answer(() => cat.client.getThread(message.id));
    const page = yield* answer(() => cat.client.listMessages("grill"));

    const reactions = [
      { by: ["bob", "cat"], count: 2, reaction: "thumbs_up" },
      { by: ["bob"], count: 1, reaction: "thumbs_down" },
    ];

    expect({ again, first, page: page.messages, thread: thread.parent }).toMatchObject({
      again: { channel: "grill", messageId: message.id, reactions },
      first: { reactions: [{ by: ["bob"], count: 1, reaction: "thumbs_up" }] },
      page: [{ id: message.id, reactions }],
      thread: { id: message.id, reactions },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("removing a reaction leaves the others, and a message with none left carries no reactions", () =>
  Effect.gen(function* unreacting() {
    const { bob, message } = yield* annPosts;
    yield* answer(() => bob.client.react(message.id, "thumbs_up"));
    yield* answer(() => bob.client.react(message.id, "thumbs_down"));
    const removed = yield* answer(() => bob.client.unreact(message.id, "thumbs_up"));
    yield* answer(() => bob.client.unreact(message.id, "thumbs_down"));
    const again = yield* answer(() => bob.client.unreact(message.id, "thumbs_down"));
    const thread = yield* answer(() => bob.client.getThread(message.id));

    expect({ again, removed, thread: thread.parent }).toStrictEqual({
      again: { channel: "grill", messageId: message.id, reactions: [] },
      removed: {
        channel: "grill",
        messageId: message.id,
        reactions: [{ by: ["bob"], count: 1, reaction: "thumbs_down" }],
      },
      thread: message,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a reaction puts its message in the author's inbox, saying who reacted with what, until the author acks it",
  () =>
    Effect.gen(function* authorNotified() {
      const { ann, bob, message } = yield* annPosts;
      yield* TestClock.adjust("1 minute");
      yield* answer(() => bob.client.react(message.id, "thumbs_up"));
      const before = yield* inboxOf(ann);
      yield* answer(() => ann.client.ack(message.id));
      const after = yield* inboxOf(ann);

      const reactions = [{ by: ["bob"], count: 1, reaction: "thumbs_up" }];
      const shown = { ...message, reactions };

      expect({ after, before }).toStrictEqual({
        after: [],
        before: [
          {
            channel: { createdAt: BOOT, name: "grill" },
            message: shown,
            newReactions: [{ identity: "bob", messageId: message.id, reactedAt: A_MINUTE_IN, reaction: "thumbs_up" }],
            parent: shown,
            reasons: ["reaction"],
          },
        ],
      });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a reaction on a reply names the reply as the item, in its thread", () =>
  Effect.gen(function* replyReaction() {
    const { ann, bob, message } = yield* annPosts;
    const { message: reply } = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: message.id, text: "or wait" }),
    );
    yield* answer(() => bob.client.react(reply.id, "thumbs_down"));
    const items = yield* inboxOf(ann);

    expect(items).toMatchObject([{ message: { id: reply.id }, parent: { id: message.id }, reasons: ["reaction"] }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("acking the whole inbox acks reaction items too", () =>
  Effect.gen(function* ackAll() {
    const { ann, bob, message } = yield* annPosts;
    yield* answer(() => bob.client.react(message.id, "thumbs_up"));
    const { message: later } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "@ann also" }));
    yield* answer(() => ann.client.ackAll(later.id));
    const items = yield* inboxOf(ann);

    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a reaction removed before the author acks it leaves the author's inbox, and notifies again if left again",
  () =>
    Effect.gen(function* removedBeforeAck() {
      const { ann, bob, message } = yield* annPosts;
      yield* answer(() => bob.client.react(message.id, "thumbs_up"));
      yield* answer(() => bob.client.unreact(message.id, "thumbs_up"));
      const removed = yield* inboxOf(ann);
      yield* answer(() => bob.client.react(message.id, "thumbs_up"));
      const again = yield* inboxOf(ann);

      expect({ again, removed }).toMatchObject({ again: [{ reasons: ["reaction"] }], removed: [] });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("reacting to your own message notifies no one", () =>
  Effect.gen(function* ownMessage() {
    const { ann, message } = yield* annPosts;
    yield* answer(() => ann.client.react(message.id, "thumbs_up"));
    const items = yield* inboxOf(ann);

    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("reacting to a deactivated author's message notifies no one, though the author comes back", () =>
  Effect.gen(function* deactivatedAuthor() {
    const { ann, cookout } = yield* annPosts;
    const dan = yield* cookout.createIdentity("dan", { kind: "human" });
    yield* answer(() => dan.client.createChannel({ name: "dans" }));
    const { message } = yield* answer(() => dan.client.createMessage({ channel: "dans", text: "mine" }));
    yield* answer(() => cookout.client.deactivateIdentity("dan"));
    yield* answer(() => ann.client.react(message.id, "thumbs_up"));
    const token = yield* Effect.flatMap(
      answer(() => cookout.client.reactivateIdentity("dan")),
      freshToken,
    );
    const { items } = yield* answer(() => cookout.clientFor(token).inbox());

    expect(items).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reaction on a message that doesn't exist is 404 message_not_found", () =>
  Effect.gen(function* refused() {
    const { bob } = yield* annPosts;
    const errors = yield* Effect.all(
      [
        refusal(() => bob.client.react(messageId(MISSING), "thumbs_up")),
        refusal(() => bob.client.unreact(messageId(MISSING), "thumbs_up")),
      ],
      { concurrency: 1 },
    );

    expect(errors).toMatchObject([
      { code: "message_not_found", status: NOT_FOUND },
      { code: "message_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reaction that isn't on the list is 404 reaction_not_found", () =>
  Effect.gen(function* unknownReaction() {
    const { bob, cookout, message } = yield* annPosts;
    const url = `${cookout.url}/v1/messages/${String(message.id)}/reactions/heart`;
    const response = yield* HttpClientRequest.put(url).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${bob.token}`),
      HttpClient.execute,
    );
    const json = yield* response.json;

    expect([response.status, json]).toMatchObject([NOT_FOUND, { error: { code: "reaction_not_found" } }]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

it.effect(
  "the all-channels feed sends each change to a message's reactions, and the author's stream the new item",
  () =>
    Effect.gen(function* liveReactions() {
      const { ann, bob, cat, message } = yield* annPosts;
      const feed = yield* watching(cat.client, { allChannels: true });
      const anns = yield* watching(ann.client);
      yield* answer(() => bob.client.react(message.id, "thumbs_up"));
      const added = yield* nextReaction(feed);
      const item = yield* nextEvent(anns);
      yield* answer(() => bob.client.unreact(message.id, "thumbs_up"));
      const removed = yield* nextReaction(feed);

      expect({ added, item, removed }).toMatchObject({
        added: { value: { messageId: message.id, reactions: [{ count: 1 }], type: "reaction" } },
        item: { value: { item: { message: { id: message.id }, reasons: ["reaction"] }, type: "inbox-item" } },
        removed: { value: { messageId: message.id, reactions: [], type: "reaction" } },
      });
    }).pipe(Effect.provide(testCookout())),
);
