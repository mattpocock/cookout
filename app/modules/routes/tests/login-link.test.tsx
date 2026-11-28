import { adminClient, anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inPane, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { alertsShown } from "./alerts.ts";
import { loginLinkWebPath } from "../../logins/index.ts";
import { openAt } from "./render.tsx";
import { profileOpened } from "./view-opened.ts";
import { token } from "../../identities/index.ts";

const SEND = "Send a login link";

async function adminOf(prefix: string): Promise<CookoutClient> {
  const viewer = await newIdentity({ kind: "human", name: `${prefix}-viewer` });
  await adminClient().makeAdmin(`${prefix}-viewer`);
  return viewer.client;
}

function secretOf(link: string): string {
  const [, secret = ""] = link.split(loginLinkWebPath);
  return secret;
}

interface Sent {
  readonly link: string;
  readonly expiry: string;
  readonly gone: HTMLElement | null;
}

async function linkSent(client: CookoutClient, name: string): Promise<Sent> {
  const { answered, close } = await profileOpened({ client, name });
  fireEvent.click(await inProfile().findByRole("button", { name: SEND }));
  await answered("createLoginLink");
  const { textContent: link } = await screen.findByLabelText("Login link");
  const { textContent: expiry } = inProfile().getByText(/expires in 15 minutes/u);
  fireEvent.click(inProfile().getByRole("button", { name: "Done" }));
  const gone = screen.queryByLabelText("Login link");
  close();
  return { expiry, gone, link };
}

async function openedFresh(client: CookoutClient, link: string): Promise<unknown> {
  const session = sessionOf(anonymousClient());
  const closeFresh = openAt({ client, hash: `#/login-link/${secretOf(link)}`, session });
  await waitFor(() => {
    expect(globalThis.location.hash).toBe("#/inbox");
  });
  const loggedIn = session.snapshot();
  closeFresh();
  return loggedIn;
}

it("an admin sends a login link from a person's profile, shown once with its expiry, and it logs that person into a fresh app", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const client = await adminOf("web-link-send");
  const person = await newIdentity({ kind: "human", name: "web-link-send-human" });
  const { expiry, gone, link } = await linkSent(client, "web-link-send-human");
  const loggedIn = await openedFresh(person.client, link);
  const again = anonymousClient().redeemLoginLink(token(secretOf(link)));

  expect([link.startsWith("http"), link.includes("/#/login-link/cookout_"), gone]).toStrictEqual([true, true, null]);
  expect(expiry).toMatch(/^It logs @web-link-send-human in once and expires in 15 minutes, at /u);
  expect(loggedIn).toMatchObject({ identity: { name: "web-link-send-human" }, status: "logged-in" });
  await expect(again).rejects.toMatchObject({ code: "login_link_not_found" });
});

it("an agent's profile offers no login link, even to an admin", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = await adminOf("web-link-agent");
  await newIdentity({ kind: "agent", name: "web-link-agent-bot", owner: "web-link-agent-viewer" });
  const { close } = await profileOpened({ client, name: "web-link-agent-bot" });
  await inProfile().findByRole("button", { name: "Make feeder" });

  expect(inProfile().queryByRole("button", { name: SEND })).toBeNull();

  close();
});

it("a used, expired or unknown login link says so, with a way to log in, not an error", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({
    client: anonymousClient(),
    hash: "#/login-link/cookout_not-a-link",
    session: sessionOf(anonymousClient()),
  });
  const heading = await screen.findByRole("heading", { name: "This login link has expired or was already used" });
  const logIn = inPane().getByRole("link", { name: "Log in" });

  expect([heading.textContent, logIn.getAttribute("href"), alertsShown()]).toStrictEqual([
    "This login link has expired or was already used",
    "#/login",
    [],
  ]);

  close();
});
