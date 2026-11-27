import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const HUMAN = { kind: "human" } as const;
const ONE_CALL = 1;
const FEEDER_REFUSAL = {
  code: "identity_kind",
  message: "github is a feeder: it only posts, so it can't watch, read an inbox or join.",
  status: 403,
};

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly ada: TestIdentity;
  readonly github: TestIdentity;
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* boardWithAnAgent() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const github = yield* cookout.createIdentity("github", { owner: "matt" });
  yield* answer(() => matt.client.createChannel({ name: "grill" }));
  return { ada, cookout, github, matt };
});

const feederBoard: Effect.Effect<Board, never, TestCookout> = Effect.tap(board, ({ matt }) =>
  answer(() => matt.client.makeFeeder("github")),
);

it.effect("an agent's owner makes it a feeder, which everyone then sees, and makes it an agent again", () =>
  Effect.gen(function* makeAndClear() {
    const { ada, matt } = yield* board;
    const made = yield* answer(() => matt.client.makeFeeder("github"));
    const seen = yield* answer(() => ada.client.getIdentity("github"));
    const listed = yield* answer(() => ada.client.listIdentities());
    const cleared = yield* answer(() => matt.client.removeFeeder("github"));

    expect(made.identity).toMatchObject({ feeder: true, kind: "agent", name: "github", owner: "matt" });
    expect(seen.identity).toStrictEqual(made.identity);
    expect(Arr.filter(listed.identities, ({ name }) => name === "github")).toStrictEqual([made.identity]);
    expect(cleared.identity).not.toHaveProperty("feeder");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin may make any agent a feeder, but another person and the agent itself may not", () =>
  Effect.gen(function* whoMay() {
    const { ada, cookout, github } = yield* board;
    const byAdmin = yield* answer(() => cookout.client.makeFeeder("github"));
    const byOther = yield* refusal(() => ada.client.removeFeeder("github"));
    const byItself = yield* refusal(() => github.client.removeFeeder("github"));

    expect(byAdmin.identity).toMatchObject({ feeder: true });
    expect(byOther).toMatchObject({ code: "not_owner", status: 403 });
    expect(byItself).toMatchObject({ code: "not_owner", status: 403 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only an agent can be a feeder, and an unknown name is a 404", () =>
  Effect.gen(function* onlyAgents() {
    const { cookout } = yield* board;
    const human = yield* refusal(() => cookout.client.makeFeeder("ada"));
    const unknown = yield* refusal(() => cookout.client.makeFeeder("nobody"));

    expect(human).toMatchObject({
      code: "identity_kind",
      message: "ada is a human identity; only an agent can be a feeder.",
      status: 403,
    });
    expect(unknown).toMatchObject({ code: "identity_not_found", status: 404 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a typed @feeder is no mention: not in the message's mentions, not unknown, and in no one's inbox", () =>
  Effect.gen(function* notAMention() {
    const { ada, cookout } = yield* feederBoard;
    yield* cookout.createIdentity("triage", { owner: "matt" });
    const posted = yield* answer(() => ada.client.createMessage({ channel: "grill", text: "@github @triage @nobody" }));

    expect(posted.message.mentions).toStrictEqual(["triage"]);
    expect(posted.unknownMentions).toStrictEqual(["nobody"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a typed @feeder calls no trigger URL", () =>
  Effect.gen(function* noTriggerCall() {
    const { ada, cookout, matt } = yield* feederBoard;
    yield* cookout.createIdentity("triage", { owner: "matt" });
    const token = "routine-secret";
    yield* answer(() => matt.client.setTrigger("github", { token, url: "https://routines.example.com/github" }));
    yield* answer(() => matt.client.setTrigger("triage", { token, url: "https://routines.example.com/triage" }));
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "@github look" }));
    yield* answer(() => ada.client.createMessage({ channel: "grill", text: "@triage look" }));
    const calls = yield* cookout.triggers.waitForCalls(ONE_CALL);

    expect(Arr.map(calls, ({ url }) => url)).toStrictEqual(["https://routines.example.com/triage"]);
  }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

it.effect("a feeder posts as before, but is refused its inbox, its inbox history and a watch", () =>
  Effect.gen(function* refusedReading() {
    const { github } = yield* feederBoard;
    const posted = yield* answer(() => github.client.createMessage({ channel: "grill", text: "PR #1 merged" }));
    const refused = yield* Effect.all(
      [
        refusal(() => github.client.inbox()),
        refusal(() => github.client.inboxHistory()),
        refusal(() => github.client.watch()),
      ],
      { concurrency: 1 },
    );

    expect(posted.message).toMatchObject({ author: { name: "github" }, text: "PR #1 merged" });
    expect(refused).toMatchObject([FEEDER_REFUSAL, FEEDER_REFUSAL, FEEDER_REFUSAL]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a feeder can't join: not with its own token, by a join request, nor with a join code", () =>
  Effect.gen(function* refusedJoins() {
    const { cookout, github, matt } = yield* feederBoard;
    const code = yield* answer(() => matt.client.createJoinCode({ displayName: "Mail", name: "mail" }));
    yield* answer(() => matt.client.makeFeeder("mail"));
    const refused = yield* Effect.all(
      [
        refusal(() => github.client.join({ as: "github" })),
        refusal(() => cookout.clientFor().startAgentJoin({ as: "github", host: "build-box" })),
        refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: code.joinCode })),
      ],
      { concurrency: 1 },
    );

    expect(refused).toMatchObject([
      FEEDER_REFUSAL,
      FEEDER_REFUSAL,
      { ...FEEDER_REFUSAL, message: "mail is a feeder: it only posts, so it can't watch, read an inbox or join." },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
