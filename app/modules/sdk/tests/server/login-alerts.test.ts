import { Array as Arr, Effect, Option } from "effect";
import type { InboxAlert, LoginAlert, PublicId } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { createTestAgent } from "../../../testing/index.ts";
import { isOfflineAlert } from "../../../inbox/index.ts";
import { request } from "../../../http/client.ts";
import { sessionPath } from "../../../identities/index.ts";

const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0";

type Client = TestIdentity["client"];

type Session = Awaited<ReturnType<Client["listSessions"]>>["sessions"][number];

function cliSession(cookout: TestCookoutService, approver: Client, host: string): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host }));
    yield* answer(() => approver.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

function webSession(url: string, token: string): Effect.Effect<void> {
  return Effect.asVoid(
    answer(() =>
      request({
        baseUrl: url,
        headers: { authorization: `Bearer ${token}`, "user-agent": FIREFOX_MAC },
        method: "POST",
        path: sessionPath,
      }),
    ),
  );
}

function isLoginAlert(alert: InboxAlert): alert is LoginAlert {
  return !isOfflineAlert(alert);
}

function loginAlertsOf(client: Client): Effect.Effect<readonly LoginAlert[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ alerts }) => Arr.filter(alerts, isLoginAlert),
  );
}

function idAt(sessions: readonly Session[], where: string): PublicId | null {
  return Option.getOrNull(
    Option.map(
      Arr.findFirst(sessions, (each) => each.where === where),
      ({ id }) => id,
    ),
  );
}

function sessionIn(login: LoginAlert["login"]): readonly PublicId[] {
  if (login.kind === "new session") {
    return [login.session];
  }
  return [];
}

function sessionOf(alerts: readonly LoginAlert[]): Effect.Effect<PublicId> {
  const sessions = Arr.flatMap(alerts, ({ login }) => sessionIn(login));
  return Effect.orDie(Effect.fromOption(Arr.head(sessions)));
}

function joinedAgent(cookout: TestCookoutService, owner: Client): Effect.Effect<void> {
  return Effect.gen(function* approveAgentJoin() {
    yield* answer(() => createTestAgent({ by: owner, name: "triage" }));
    const start = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "triage", host: "build-box" }));
    yield* answer(() => owner.approveAgentJoin(start.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectAgentJoin(start.requestId));

    expect(collected.status).toBe("approved");
  });
}

it.effect("pasting a token on the web and approving a CLI Login request each raise one Login alert", () =>
  Effect.gen(function* raised() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* webSession(cookout.url, ada.token);
    yield* cliSession(cookout, ada.client, "ada-laptop");
    const alerts = yield* loginAlertsOf(ada.client);
    const { sessions } = yield* answer(() => ada.client.listSessions());

    expect(Arr.map(alerts, ({ login, read }) => ({ login, read }))).toMatchObject([
      {
        login: { ended: false, kind: "new session", session: idAt(sessions, "Firefox on macOS"), sessionKind: "web" },
        read: false,
      },
      {
        login: { ended: false, kind: "new session", session: idAt(sessions, "ada-laptop"), sessionKind: "cli" },
        read: false,
      },
    ]);
    expect(Arr.map(alerts, ({ login }) => login.kind === "new session" && typeof login.clientIp)).toStrictEqual([
      "string",
      "string",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent joining raises no Login alert for its owner", () =>
  Effect.gen(function* noneForAgents() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* joinedAgent(cookout, ada.client);
    const alerts = yield* loginAlertsOf(ada.client);

    expect(alerts).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("once its session is revoked, a Login alert shows the session ended", () =>
  Effect.gen(function* ended() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cliSession(cookout, ada.client, "ada-laptop");
    const before = yield* loginAlertsOf(ada.client);
    const session = yield* sessionOf(before);
    yield* answer(() => ada.client.revokeSession(session));
    const after = yield* loginAlertsOf(ada.client);

    expect(after).toStrictEqual(Arr.map(before, (alert) => ({ ...alert, login: { ...alert.login, ended: true } })));
  }).pipe(Effect.provide(testCookout())),
);
