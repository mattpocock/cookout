import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const BOOT = "2026-01-01T00:00:00.000Z";
const HUMAN = { kind: "human" } as const;

it.effect("an admin makes a human an admin, who can then create humans, until it is removed", () =>
  Effect.gen(function* makeAndRemove() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const made = yield* answer(() => cookout.client.makeAdmin("grace"));
    const created = yield* answer(() => grace.client.createIdentity({ kind: "human", name: "ada" }));
    const removed = yield* answer(() => cookout.client.removeAdmin("grace"));
    const refused = yield* refusal(() => grace.client.createIdentity({ kind: "human", name: "eve" }));

    expect(made).toStrictEqual({ identity: { admin: true, createdAt: BOOT, kind: "human", name: "grace" } });
    expect(created.identity).toMatchObject({ name: "ada" });
    expect(removed).toStrictEqual({ identity: { admin: false, createdAt: BOOT, kind: "human", name: "grace" } });
    expect(refused).toMatchObject({ code: "admin_only", status: 403 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("making an admin of an admin, or removing admin from a non-admin, changes nothing", () =>
  Effect.gen(function* unchanged() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", HUMAN);
    const again = yield* answer(() => cookout.client.makeAdmin("admin"));
    const notAdmin = yield* answer(() => cookout.client.removeAdmin("grace"));

    expect(again.identity).toMatchObject({ admin: true, name: "admin" });
    expect(notAdmin.identity).toMatchObject({ admin: false, name: "grace" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("making an agent an admin is refused with 403 human_only", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("release-bot");
    const error = yield* refusal(() => cookout.client.makeAdmin("release-bot"));
    const listed = yield* answer(cookout.client.listIdentities);

    expect(error).toMatchObject({
      code: "human_only",
      details: { kind: "agent" },
      message: "Only a human can be an admin.",
      status: 403,
    });
    expect(listed.identities).toContainEqual(expect.objectContaining({ admin: false, name: "release-bot" }));
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a non-admin's admin change is refused with 403 admin_only", () =>
  Effect.gen(function* nonAdmin() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const make = yield* refusal(() => grace.client.makeAdmin("grace"));
    const remove = yield* refusal(() => grace.client.removeAdmin("admin"));

    expect(make).toMatchObject({ code: "admin_only", status: 403 });
    expect(remove).toMatchObject({ code: "admin_only", status: 403 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin change for an unknown name is a 404", () =>
  Effect.gen(function* unknownName() {
    const cookout = yield* TestCookout;
    const make = yield* refusal(() => cookout.client.makeAdmin("nobody"));
    const remove = yield* refusal(() => cookout.client.removeAdmin("Not A Name"));

    expect(make).toMatchObject({ code: "identity_not_found", status: 404 });
    expect(remove).toMatchObject({ code: "identity_not_found", status: 404 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("removing admin from the only admin is refused with 409 last_admin", () =>
  Effect.gen(function* lastAdmin() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(() => cookout.client.removeAdmin("admin"));
    const whoami = yield* answer(cookout.client.whoami);

    expect(error).toMatchObject({ code: "last_admin", status: 409 });
    expect(whoami.identity).toMatchObject({ admin: true, name: "admin" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("with two admins, one removes the other's admin, then the last one keeps it", () =>
  Effect.gen(function* removeOther() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", HUMAN);
    yield* answer(() => cookout.client.makeAdmin("grace"));
    const removed = yield* answer(() => cookout.client.removeAdmin("grace"));
    const last = yield* refusal(() => cookout.client.removeAdmin("admin"));

    expect(removed.identity).toMatchObject({ admin: false, name: "grace" });
    expect(last).toMatchObject({ code: "last_admin", status: 409 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin removes its own admin while another remains, and its next admin-only request is 403", () =>
  Effect.gen(function* removeSelf() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    yield* answer(() => cookout.client.makeAdmin("grace"));
    const removed = yield* answer(() => grace.client.removeAdmin("grace"));
    const refused = yield* refusal(() => grace.client.makeAdmin("grace"));

    expect(removed.identity).toMatchObject({ admin: false, name: "grace" });
    expect(refused).toMatchObject({ code: "admin_only", status: 403 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the admin identity gets its admin back at the next boot", () =>
  Effect.gen(function* bootRestores() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    yield* answer(() => cookout.client.makeAdmin("grace"));
    yield* answer(() => grace.client.removeAdmin("admin"));
    const before = yield* answer(cookout.client.whoami);
    const restarted = yield* cookout.startSecondServerAs("admin");
    const after = yield* answer(cookout.clientFor(restarted.settingToken).whoami);

    expect(before.identity).toMatchObject({ admin: false, name: "admin" });
    expect(after.identity).toMatchObject({ admin: true, name: "admin" });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);
