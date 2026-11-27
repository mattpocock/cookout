import type { CookoutClient, IdentityName } from "../../sdk/index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { humanIn, opened } from "./held-store.ts";
import type { SessionList } from "../index.ts";
import { createComposer } from "../../composer/index.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { memoryStorage } from "../../testing/web.ts";
import { waitFor } from "@testing-library/react";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NONE = 0;
const ONE = 1;

async function noCrop(): Promise<null> {
  await Promise.resolve();
  return null;
}

async function laptopOf(person: CookoutClient): Promise<CookoutClient> {
  const anonymous = createCookoutClient({ env: {}, url: webTestCookout().url });
  const started = await anonymous.startLogin({ host: "board-oversee-laptop" });
  await person.approveLogin(started.userCode);
  const collected = await anonymous.collectLogin(started.requestId);
  if (collected.status === "approved") {
    return createCookoutClient({ env: {}, token: collected.token, url: webTestCookout().url });
  }
  return expect.unreachable("The login was not approved.");
}

async function shownSessions(name: IdentityName): Promise<SessionList> {
  const { store } = opened();
  const composer = createComposer({ boardStore: store, crop: noCrop, storage: memoryStorage() });
  const sessions = composer.identities.sessionList(name);
  onTestFinished(sessions.subscribe(vi.fn<() => void>()));
  await waitFor(() => {
    expect(sessions.snapshot().sessions).toHaveLength(ONE);
  });
  return sessions;
}

async function askedEverywhere(sessions: SessionList): Promise<unknown> {
  sessions.askLogOutEverywhere();
  await waitFor(() => {
    expect(sessions.snapshot().asked).not.toBeNull();
  });
  return sessions.snapshot().asked;
}

async function loggedOutEverywhere(sessions: SessionList): Promise<unknown> {
  sessions.confirm();
  await waitFor(() => {
    expect(sessions.snapshot().sessions).toHaveLength(NONE);
  });
  return sessions.snapshot().sessions;
}

it("an admin's Log out everywhere on a person's sessions counts them first, then ends every one", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const person = await humanIn("board-oversee");
  const laptop = await laptopOf(person.client);
  const sessions = await shownSessions(person.name);
  const asked = await askedEverywhere(sessions);
  const left = await loggedOutEverywhere(sessions);

  expect({ asked, left }).toStrictEqual({
    asked: { kind: "everywhere", willEnd: { agentSessions: NONE, joinCodes: NONE, sessions: ONE } },
    left: [],
  });
  await expect(laptop.whoami()).rejects.toMatchObject({ code: "token_unknown" });
});
