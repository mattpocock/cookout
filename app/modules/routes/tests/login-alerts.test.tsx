import type { CookoutClient, IdentityName, InboxAlert } from "../../sdk/index.ts";
import { anonymousClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
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
