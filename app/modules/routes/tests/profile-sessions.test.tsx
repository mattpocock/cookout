import { adminClient, anonymousClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { profileOpened } from "./view-opened.ts";
import { refusalOf } from "../../sdk/index.ts";

interface Seen {
  readonly viewer: CookoutClient;
  readonly person: CookoutClient;
  readonly laptop: string;
}

async function approvedLogin(approver: CookoutClient, host: string): Promise<string> {
  const started = await anonymousClient().startLogin({ host });
  await approver.approveLogin(started.userCode);
  const collected = await anonymousClient().collectLogin(started.requestId);
  if (collected.status === "approved") {
    return collected.token;
  }
  return expect.unreachable("The login was not approved.");
}

async function seenBy(prefix: string, admin: boolean): Promise<Seen> {
  const { client: viewer } = await newIdentity({ kind: "human", name: `${prefix}-viewer` });
  if (admin) {
    await adminClient().makeAdmin(`${prefix}-viewer`);
  }
  const { client: person } = await newIdentity({ kind: "human", name: `${prefix}-person` });
  const laptop = await approvedLogin(person, `${prefix}-laptop`);
  return { laptop, person, viewer };
}

async function refusalWith(token: string): Promise<string> {
  try {
    await clientWith(token).whoami();
    return "accepted";
  } catch (error: unknown) {
    return refusalOf(error).code;
  }
}

async function actsOf(client: CookoutClient): Promise<readonly unknown[]> {
  const { alerts } = await client.inbox();
  return alerts.flatMap((alert) => {
    if ("login" in alert && alert.login.kind === "admin act") {
      return [alert.login];
    }
    return [];
  });
}

async function revokedOnProfile(where: string): Promise<string | null> {
  const card = await inProfile().findByRole("group", { name: where });
  fireEvent.click(within(card).getByRole("button", { name: "Revoke" }));
  const { textContent } = await inDialog().findByRole("heading", { name: `Revoke ${where}?` });
  fireEvent.click(inDialog().getByRole("button", { name: "Revoke" }));
  await waitFor(() => {
    expect(inProfile().queryByRole("group", { name: where })).toBeNull();
  });
  return textContent;
}

it("an admin sees a person's sessions on their profile, and revoking one asks first, ends it and alerts them", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const { laptop, person, viewer } = await seenBy("web-oversee", true);
  const { close } = await profileOpened({ client: viewer, name: "web-oversee-person" });
  const question = await revokedOnProfile("web-oversee-laptop");

  expect([question, await refusalWith(laptop)]).toStrictEqual(["Revoke web-oversee-laptop?", "token_unknown"]);
  await expect(actsOf(person)).resolves.toMatchObject([
    { act: "revoked a session", admin: "web-oversee-viewer", kind: "admin act" },
  ]);

  close();
});

it("a person who isn't an admin sees no sessions on another person's profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { viewer } = await seenBy("web-oversee-not", false);
  const { close } = await profileOpened({
    client: viewer,
    name: "web-oversee-not-person",
    waitingOn: ["listIdentities"],
  });
  await screen.findByRole("complementary", { name: "Profile" });

  expect([
    inProfile().queryByRole("group", { name: "web-oversee-not-laptop" }),
    inProfile().queryByRole("heading", { name: "Sessions" }),
  ]).toStrictEqual([null, null]);

  close();
});
