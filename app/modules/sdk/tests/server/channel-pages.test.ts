import { Array as Arr, Effect, Option, pipe } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { ListMessagesResponse, MessageId } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const BAD_REQUEST = 400;
const PAGE = 2;
const TOO_FEW = 0;
const TOO_MANY = 201;
const BEFORE_FIRST = -1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const INVALID_PATH = { body: { error: { code: "invalid_path" } }, status: BAD_REQUEST };

function withChannel(cookout: TestCookoutService): Effect.Effect<TestIdentity> {
  return Effect.gen(function* identityWithChannel() {
    const agent = yield* cookout.createIdentity("auth-griller", { owner: "matt" });
    yield* answer(() => agent.client.createChannel({ name: "grill" }));
    return agent;
  });
}

function firstIdOf(page: ListMessagesResponse): MessageId {
  return Option.getOrThrow(Arr.head(page.messages)).id;
}

function texts(...shown: readonly string[]): readonly { readonly text: string }[] {
  return Arr.map(shown, (text) => ({ text }));
}

it.effect("a channel page lists top-level messages oldest first, without replies", () =>
  Effect.gen(function* oldestFirst() {
    const cookout = yield* TestCookout;
    const agent = yield* withChannel(cookout);
    const { message: first } = yield* answer(() => agent.client.createMessage({ channel: "grill", text: "a" }));
    yield* answer(() => agent.client.createMessage({ channel: "grill", replyTo: first.id, text: "reply" }));
    yield* answer(() => agent.client.createMessage({ channel: "grill", text: "b" }));
    const page = yield* answer(() => agent.client.listMessages("grill"));

    expect(page).toMatchObject({ hasMore: false, messages: texts("a", "b") });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a channel pages back from a message ID", () =>
  Effect.gen(function* pageBack() {
    const cookout = yield* TestCookout;
    const agent = yield* withChannel(cookout);
    yield* pipe(
      ["m0", "m1", "m2", "m3", "m4"],
      Effect.forEach((text) => answer(() => agent.client.createMessage({ channel: "grill", text })), ONE_AT_A_TIME),
    );
    const latest = yield* answer(() => agent.client.listMessages("grill", { limit: PAGE }));
    const before = yield* answer(() => agent.client.listMessages("grill", { before: firstIdOf(latest), limit: PAGE }));
    const oldest = yield* answer(() => agent.client.listMessages("grill", { before: firstIdOf(before), limit: PAGE }));

    expect([latest, before, oldest]).toMatchObject([
      { hasMore: true, messages: texts("m3", "m4") },
      { hasMore: true, messages: texts("m1", "m2") },
      { hasMore: false, messages: texts("m0") },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a channel page holds only that channel's messages", () =>
  Effect.gen(function* onlyThisChannel() {
    const cookout = yield* TestCookout;
    const agent = yield* withChannel(cookout);
    yield* answer(() => agent.client.createChannel({ name: "other" }));
    yield* answer(() => agent.client.createMessage({ channel: "other", text: "not here" }));
    yield* answer(() => agent.client.createMessage({ channel: "grill", text: "here" }));
    const page = yield* answer(() => agent.client.listMessages("grill"));

    expect(page).toMatchObject({ messages: texts("here") });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a bad page cursor or limit is refused with 400", () =>
  Effect.gen(function* badCursor() {
    const cookout = yield* TestCookout;
    const agent = yield* withChannel(cookout);
    const refused = yield* pipe(
      [{ limit: TOO_FEW }, { limit: TOO_MANY }, { before: BEFORE_FIRST }] as const,
      Effect.forEach((query) => refusal(() => agent.client.listMessages("grill", query)), ONE_AT_A_TIME),
    );
    const invalid = { code: "invalid_request", status: BAD_REQUEST };

    expect(refused).toMatchObject([invalid, invalid, invalid]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a path segment that isn't valid percent-encoding is 400 invalid_path on every route that takes a name", () =>
  Effect.gen(function* invalidPath() {
    const cookout = yield* TestCookout;
    const answers = yield* pipe(
      [
        HttpClientRequest.get(`${cookout.url}/v1/channels/%E0`),
        HttpClientRequest.get(`${cookout.url}/v1/channels/%E0/messages`),
        HttpClientRequest.post(`${cookout.url}/v1/identities/%E0/deactivate`),
        HttpClientRequest.post(`${cookout.url}/v1/identities/%E0/token`),
      ],
      Effect.forEach(
        (attempt) =>
          HttpClient.execute(
            HttpClientRequest.setHeader(attempt, "authorization", `Bearer ${cookout.adminSession}`),
          ).pipe(
            Effect.flatMap((response) => Effect.map(response.json, (body) => ({ body, status: response.status }))),
          ),
        ONE_AT_A_TIME,
      ),
    );

    expect(answers).toMatchObject([INVALID_PATH, INVALID_PATH, INVALID_PATH, INVALID_PATH]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

it.effect("reading a missing channel's messages is a 404", () =>
  Effect.gen(function* missingChannel() {
    const cookout = yield* TestCookout;
    const agent = yield* withChannel(cookout);
    const error = yield* refusal(() => agent.client.listMessages("nowhere"));
    const badName = yield* refusal(() => agent.client.listMessages("Not A Name"));

    expect([error, badName]).toMatchObject([
      { code: "channel_not_found", status: 404 },
      { code: "channel_not_found", status: 404 },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
