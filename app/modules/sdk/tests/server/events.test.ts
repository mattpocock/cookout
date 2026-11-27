import type { CookoutEvent, EventStream } from "../../index.ts";
import { TestCookout, answer, refusal, serverAnswering, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import { createCookoutClient } from "../../index.ts";

const BOOT = "2026-01-01T00:00:00.000Z";
const SSE = { "content-type": "text/event-stream" };

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

function watching(who: TestIdentity): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => who.client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function nextEvent(events: AsyncIterator<CookoutEvent>): Effect.Effect<IteratorResult<CookoutEvent>> {
  return answer(() => events.next());
}

it.effect("a mention arrives over the stream as an inbox item, with its channel and thread", () =>
  Effect.gen(function* mentionArrives() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const events = yield* watching(bob);
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob have a look" }));
    const event = yield* nextEvent(events);

    expect(event).toStrictEqual({
      done: false,
      value: {
        item: { channel: { createdAt: BOOT, name: "grill" }, message, parent: message, reasons: ["mention"] },
        type: "inbox-item",
      },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply in a followed thread arrives over the stream", () =>
  Effect.gen(function* replyArrives() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message: parent } = yield* answer(() => bob.client.createMessage({ channel: "grill", text: "parent" }));
    const events = yield* watching(bob);
    const { message: reply } = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: parent.id, text: "reply" }),
    );
    const event = yield* nextEvent(events);

    expect(event).toMatchObject({
      value: { item: { message: reply, parent: { id: parent.id }, reasons: ["followed-thread"] } },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the author's own post doesn't arrive as an inbox item for the author", () =>
  Effect.gen(function* ownPostSkipped() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    yield* answer(() => bob.client.subscribe("grill"));
    const events = yield* watching(bob);
    yield* answer(() => bob.client.createMessage({ channel: "grill", text: "@bob note to self" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "from ann" }));
    const event = yield* nextEvent(events);

    expect(event).toMatchObject({ value: { item: { message: { id: message.id }, reasons: ["subscribed-channel"] } } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("watching without a valid token is refused before the stream opens", () =>
  Effect.gen(function* watchRefused() {
    const cookout = yield* TestCookout;
    const refused = yield* refusal(() => cookout.clientFor("cookout_wrong").watch());

    expect(refused).toMatchObject({ status: 401 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an event that doesn't match its generated validator fails with bad_response", () =>
  Effect.gen(function* badEvent() {
    const url = yield* serverAnswering({
      headers: SSE,
      text: 'event: inbox-item\nid: 1\ndata: {"type":"inbox-item","item":{}}\n\n',
    });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const refused = yield* refusal(() => events[Symbol.asyncIterator]().next());

    expect(refused).toMatchObject({ code: "bad_response", details: { item: {}, type: "inbox-item" } });
  }),
);

it.effect("an event whose data isn't JSON fails with bad_response, with the data as its details", () =>
  Effect.gen(function* notJsonEvent() {
    const url = yield* serverAnswering({ headers: SSE, text: "event: inbox-item\ndata: not json\n\n" });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const refused = yield* refusal(() => events[Symbol.asyncIterator]().next());

    expect(refused).toMatchObject({ code: "bad_response", details: "not json" });
  }),
);

it.effect("closing the stream ends it", () =>
  Effect.gen(function* closeEnds() {
    const cookout = yield* TestCookout;
    const { bob } = yield* board(cookout);
    const events = yield* answer(() => bob.client.watch());
    const next = events[Symbol.asyncIterator]().next();
    yield* answer(() => events.close());
    const result = yield* answer(() => next);

    expect(result).toMatchObject({ done: true });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an event type this SDK doesn't know, from a newer server, is skipped", () =>
  Effect.gen(function* unknownEvent() {
    const url = yield* serverAnswering({ headers: SSE, text: 'event: kettle\nid: 1\ndata: {"type":"kettle"}\n\n' });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const result = yield* answer(() => events[Symbol.asyncIterator]().next());

    expect(result).toMatchObject({ done: true });
  }),
);

it.effect("a refusal event that isn't an error body fails with bad_response", () =>
  Effect.gen(function* badRefusal() {
    const url = yield* serverAnswering({ headers: SSE, text: 'event: refusal\ndata: {"error":{}}\n\n' });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const refused = yield* refusal(() => events[Symbol.asyncIterator]().next());

    expect(refused).toMatchObject({ code: "bad_response", details: { error: {} } });
  }),
);

it.effect("the stream first tells onConnected the board's latest message ID, and every item after it is newer", () =>
  Effect.gen(function* connectedFirst() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message: before } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob old" }));
    const heard: unknown[] = [];
    const events = yield* answer(() =>
      bob.client.watch({
        onConnected: (latest) => {
          heard.push(latest);
        },
      }),
    );
    const { message: after } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob new" }));
    const event = yield* answer(() => events[Symbol.asyncIterator]().next());
    yield* answer(() => events.close());

    expect({ event, heard }).toMatchObject({ event: { value: { item: { message: after } } }, heard: [before.id] });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a connected event that doesn't match the protocol fails with bad_response", () =>
  Effect.gen(function* badConnected() {
    const url = yield* serverAnswering({ headers: SSE, text: 'event: connected\ndata: {"type":"connected"}\n\n' });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const refused = yield* refusal(() => events[Symbol.asyncIterator]().next());

    expect(refused).toMatchObject({ code: "bad_response", details: { type: "connected" } });
  }),
);

it.effect.each([
  { connected: '{"latestMessageId":null,"type":"connected"}', server: "a server that names no connection" },
  { connected: '{"connectionId":1,"latestMessageId":null,"type":"connected"}', server: "a server that can't hear it" },
] as const)("closeCleanly still closes the stream on $server", ({ connected }) =>
  Effect.gen(function* closesAnyway() {
    const url = yield* serverAnswering({ headers: SSE, text: `event: connected\ndata: ${connected}\n\n` });
    const client = createCookoutClient({ env: {}, token: "cookout_x", url });
    const events = yield* answer(() => client.watch());
    const next = yield* answer(() => events[Symbol.asyncIterator]().next());
    yield* answer(() => events.closeCleanly());

    expect(next).toMatchObject({ done: true });
  }),
);
