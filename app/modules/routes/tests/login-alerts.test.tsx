import type { CookoutClient, IdentityName, InboxAlert } from "../../sdk/index.ts";
import { adminClient, anonymousClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { loginLinkWebPath } from "../../logins/index.ts";
import { openAt } from "./render.tsx";
import { token } from "../../identities/index.ts";
import { watched } from "./watched.ts";

const UNAUTHORIZED = 401;
const FIRST = 0;
const ONE = 1;
const TWO = 2;

async function cliSession(approver: CookoutClient, host: string): Promise<string> {
  const started = await anonymousClient().startLogin({ host });
  await approver.approveLogin(started.userCode);
  const collected = await anonymousClient().collectLogin(started.requestId);
  if (collected.status !== "approved") {
    throw new Error("The login was not approved.");
  }
  return collected.token;
}

async function closed(unmount: () => void, events: { readonly close: () => Promise<void> }): Promise<void> {
  unmount();
  await events.close();
}

async function revokedFromInbox(owner: CookoutClient): Promise<readonly [number, HTMLElement | null]> {
  const { live, stream } = watched(owner);
  const unmount = openAt({ client: owner, hash: "#/inbox", live });
  const events = await stream;
  await within(inPane().element()).findByText(/^New login: cookout CLI on web-login-laptop, /u);
  const shownLive = within(inPane().element()).queryAllByText(/Session live$/u).length;
  fireEvent.click(inPane().getByRole("button", { name: "Revoke" }));
  await within(inPane().element()).findByText(/Session ended$/u);
  const revokeLeft = inPane().queryByRole("button", { name: "Revoke" });
  await closed(unmount, events);
  return [shownLive, revokeLeft];
}

it("a Login alert's Revoke ends its session, and then the alert shows the session ended with no Revoke", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-login-alert" });
  const session = await cliSession(owner.client, "web-login-laptop");
  const shown = await revokedFromInbox(owner.client);

  await expect(clientWith(session).whoami()).rejects.toMatchObject({ status: UNAUTHORIZED });
  expect(shown).toStrictEqual([ONE, null]);

  await waitFor(async () => {
    await expect(owner.client.inbox()).resolves.toMatchObject({ alerts: [{ login: { ended: true } }] });
  });
});

function asShown(admin: IdentityName): (alert: InboxAlert, index: number) => InboxAlert {
  return (alert, index) => {
    if (!("login" in alert) || alert.login.kind !== "new session") {
      return alert;
    }
    const { session } = alert.login;
    if (index === FIRST) {
      return { ...alert, login: { act: "revoked", admin, credential: session, kind: "admin act" } };
    }
    return {
      ...alert,
      login: { ended: false, kind: "new session", session, sessionKind: "web", where: "web browser" },
    };
  };
}

function shownAs(owner: CookoutClient, admin: IdentityName): CookoutClient {
  return {
    ...owner,
    inbox: async () => {
      const inbox = await owner.inbox();
      return { ...inbox, alerts: inbox.alerts.map(asShown(admin)) };
    },
  };
}

async function shownAlerts(owner: CookoutClient): Promise<readonly [number, number]> {
  const { identity } = await owner.whoami();
  const { live, stream } = watched(owner);
  const unmount = openAt({ client: shownAs(owner, identity.name), hash: "#/inbox", live });
  const events = await stream;
  const pane = within(inPane().element());
  const shown = [
    await pane.findByText(/^An admin acted on your credentials: @web-login-admin revoked, /u),
    await pane.findByText(/^New login: web browser, \d/u),
  ];
  const revokes = pane.getAllByRole("button", { name: "Revoke" }).length;
  await closed(unmount, events);
  return [shown.length, revokes];
}

it("a Login alert says when an admin acted on your credentials, and a web login with no IP names only its browser", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-login-admin" });
  await cliSession(owner.client, "web-login-first");
  await cliSession(owner.client, "web-login-second");

  await expect(shownAlerts(owner.client)).resolves.toStrictEqual([TWO, ONE]);
});

async function earlierLogin(owner: CookoutClient): Promise<HTMLElement | null> {
  const { live, stream } = watched(owner);
  const unmount = openAt({ client: owner, hash: "#/inbox", live });
  const events = await stream;
  const earlier = within(await inPane().findByRole("list", { name: "Earlier" }));
  await earlier.findByText(/^New login: cookout CLI on web-login-earlier, /u);
  const revoke = earlier.queryByRole("button", { name: "Revoke" });
  await closed(unmount, events);
  return revoke;
}

it("a read Login alert moves to Earlier, with no Revoke even while its session lives", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-login-earlier" });
  await cliSession(owner.client, "web-login-earlier");
  const { alerts } = await owner.client.inbox();
  await Promise.all(
    alerts.map(async ({ id }) => {
      await owner.client.markOfflineAlertRead(id);
    }),
  );

  await expect(earlierLogin(owner.client)).resolves.toBeNull();
});

async function linkedLogin(owner: CookoutClient): Promise<readonly [string, number]> {
  const { live, stream } = watched(owner);
  const unmount = openAt({ client: owner, hash: "#/inbox", live });
  const events = await stream;
  const pane = within(inPane().element());
  const shown = await pane.findByText(/^New login from a login link: /u);
  const revokes = pane.getAllByRole("button", { name: "Revoke" }).length;
  await closed(unmount, events);
  return [shown.textContent, revokes];
}

it("a Login alert for a session a login link made says it came from a login link, with Revoke while it lives", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-login-linked" });
  const { link } = await adminClient().createLoginLink("web-login-linked");
  const [, secret = ""] = link.split(loginLinkWebPath);
  await anonymousClient().redeemLoginLink(token(secret));

  await expect(linkedLogin(owner.client)).resolves.toStrictEqual([
    expect.stringMatching(/^New login from a login link: web browser, /u),
    ONE,
  ]);
});

function asConsoleAct(alert: InboxAlert): InboxAlert {
  if (!("login" in alert) || alert.login.kind !== "new session") {
    return alert;
  }
  return { ...alert, login: { act: "sent a login link", credential: alert.login.session, kind: "admin act" } };
}

async function consoleActShown(owner: CookoutClient): Promise<HTMLElement> {
  const { live, stream } = watched(owner);
  const client: CookoutClient = {
    ...owner,
    inbox: async () => {
      const inbox = await owner.inbox();
      return { ...inbox, alerts: inbox.alerts.map(asConsoleAct) };
    },
  };
  const unmount = openAt({ client, hash: "#/inbox", live });
  const events = await stream;
  const shown = await within(inPane().element()).findByText(
    /^The server console acted on your credentials: sent a login link, /u,
  );
  await closed(unmount, events);
  return shown;
}

it("a Login alert for an act from the server console names the server console, not an admin", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-login-console" });
  await cliSession(owner.client, "web-login-console");

  await expect(consoleActShown(owner.client)).resolves.toBeInstanceOf(HTMLElement);
});
