import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import { Effect, pipe } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function runAll(
  env: Readonly<Record<string, string>>,
  commandLines: readonly (readonly string[])[],
): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(
    commandLines,
    Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
  );
}

it.effect(
  "cookout inbox prints the items as JSON, and cookout ack and cookout unread print the new read position",
  () =>
    Effect.gen(function* inboxAndAck() {
      const cookout = yield* TestCookout;
      const ann = yield* cookout.createIdentity("ann");
      const bob = yield* cookout.createIdentity("bob");
      const folder = yield* freshStateFolder;
      yield* answer(() => ann.client.createChannel({ name: "grill" }));
      const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob have a look" }));
      const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url };
      const results = yield* runAll(env, [["inbox"], ["ack", String(message.id)], ["unread", String(message.id)]]);

      expect(results).toMatchObject([
        { exitCode: 0, stdoutJson: { items: [{ message: { id: message.id }, reasons: ["mention"] }] } },
        { exitCode: 0, stdoutJson: { readPosition: { messageId: message.id } } },
        { exitCode: 0, stdoutJson: { readPosition: { channel: "grill", messageId: null, thread: null } } },
      ]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout follow, unfollow, subscribe and unsubscribe print the new state", () =>
  Effect.gen(function* followAndSubscribe() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "parent" }));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: ann.token, COOKOUT_URL: cookout.url };
    const id = String(message.id);
    const results = yield* runAll(env, [
      ["unfollow", id],
      ["follow", id],
      ["subscribe", "grill"],
      ["unsubscribe", "grill"],
    ]);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { following: false, thread: message.id } },
      { exitCode: 0, stdoutJson: { following: true, thread: message.id } },
      { exitCode: 0, stdoutJson: { channel: "grill", subscribed: true } },
      { exitCode: 0, stdoutJson: { channel: "grill", subscribed: false } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout inbox --history prints a page of the inbox history, paged with --before and --limit", () =>
  Effect.gen(function* inboxHistory() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const first = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob one" }));
    const second = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob two" }));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url };
    const results = yield* runAll(env, [
      ["inbox", "--history", "--limit", "1"],
      ["inbox", "--history", "--before", String(second.message.id), "--limit", "1"],
    ]);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { hasMore: true, items: [{ message: { id: second.message.id }, read: false }] } },
      { exitCode: 0, stdoutJson: { hasMore: false, items: [{ message: { id: first.message.id }, read: false }] } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout thread get prints the thread's read receipts, seen once the mentioned identity acks", () =>
  Effect.gen(function* threadReceipts() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    const folder = yield* freshStateFolder;
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "@bob have a look" }));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bob.token, COOKOUT_URL: cookout.url };
    const id = String(message.id);
    const results = yield* runAll(env, [
      ["thread", "get", id],
      ["ack", id],
      ["thread", "get", id],
    ]);

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { receipts: [{ identity: "bob", messageId: message.id, seen: false }] } },
      { exitCode: 0 },
      { exitCode: 0, stdoutJson: { receipts: [{ identity: "bob", messageId: message.id, seen: true }] } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout inbox prints the owner's unread offline alerts beside the items", () =>
  Effect.gen(function* inboxAlerts() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", { kind: "human" });
    yield* cookout.createIdentity("triage", { owner: "matt" });
    const folder = yield* freshStateFolder;
    const { agentSessionToken } = yield* answer(() => matt.client.join({ as: "triage" }));
    yield* answer(() => cookout.clientFor(agentSessionToken).watch());
    yield* Effect.andThen(
      answer(() => cookout.client.revokeAgentSession("triage")),
      cookout.liveConnectionsClosed("triage"),
    );
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: matt.token, COOKOUT_URL: cookout.url };
    const results = yield* runAll(env, [["inbox"]]);

    expect(results).toMatchObject([
      {
        exitCode: 0,
        stdoutJson: { alerts: [{ agent: "triage", offlineReason: "session revoked", read: false }], items: [] },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout inbox prints a Login alert for a person's new CLI session, with its session still live", () =>
  Effect.gen(function* inboxLoginAlert() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", { kind: "human" });
    const folder = yield* freshStateFolder;
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "matt-laptop" }));
    yield* answer(() => matt.client.approveLogin(started.userCode));
    yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: matt.token, COOKOUT_URL: cookout.url };
    const results = yield* runAll(env, [["inbox"]]);

    expect(results).toMatchObject([
      {
        exitCode: 0,
        stdoutJson: {
          alerts: [
            { login: { ended: false, kind: "new session", sessionKind: "cli", where: "matt-laptop" }, read: false },
          ],
          items: [],
        },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
