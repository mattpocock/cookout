import type { CookoutClient, Identity } from "../../sdk/index.ts";
import { anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { CookoutError } from "../../sdk/index.ts";
import type { RedeemSetupLinkRequest } from "../../logins/setup-links.ts";
import { alertsShown } from "./alerts.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const CONFLICT = 409;
const NAME = "Your name";
const DISPLAY_NAME = "Your display name (optional)";
const CREATE = "Create admin";

type Redeem = (request: RedeemSetupLinkRequest) => Promise<{ readonly identity: Identity }>;

function nameTaken(name: string): CookoutError {
  return new CookoutError({
    code: "identity_exists",
    message: `The name ${name} is taken. Choose another.`,
    status: CONFLICT,
  });
}

function stubbedRedeem(person: Identity): ReturnType<typeof vi.fn<Redeem>> {
  return vi.fn<Redeem>(async (request) => {
    await Promise.resolve();
    if (request.name !== person.name) {
      throw nameTaken(request.name);
    }
    return { identity: person };
  });
}

function filledIn(name: string, displayName: string): void {
  fireEvent.change(inPane().getByRole("textbox", { name: NAME }), { target: { value: name } });
  fireEvent.change(inPane().getByRole("textbox", { name: DISPLAY_NAME }), { target: { value: displayName } });
  fireEvent.click(inPane().getByRole("button", { name: CREATE }));
}

interface Named {
  readonly refusal: string | null;
  readonly calls: readonly unknown[];
  readonly loggedIn: unknown;
}

interface Opened {
  readonly close: () => void;
  readonly redeemSetupLink: ReturnType<typeof stubbedRedeem>;
  readonly session: ReturnType<typeof sessionOf>;
}

async function openedForAdmin(): Promise<Opened> {
  const person = await newIdentity({ kind: "human", name: "web-setup-admin" });
  const { identity } = await person.client.whoami();
  const redeemSetupLink = stubbedRedeem(identity);
  const client: CookoutClient = { ...person.client, redeemSetupLink };
  const session = sessionOf(client);
  const close = openAt({ client, hash: "#/setup-link/cookout_setup-secret", session });
  await screen.findByRole("heading", { name: "Set up your cookout" });
  return { close, redeemSetupLink, session };
}

async function namedTakenThenFree(): Promise<Named> {
  const { close, redeemSetupLink, session } = await openedForAdmin();
  filledIn("web-setup-taken", "");
  const { textContent: refusal } = await inPane().findByText(/^Couldn't set up the admin \(identity_exists\)/u);
  filledIn("web-setup-admin", " Grace ");
  await waitFor(() => {
    expect(globalThis.location.hash).toBe("#/inbox");
  });
  close();
  return { calls: redeemSetupLink.mock.calls, loggedIn: session.snapshot(), refusal };
}

it("the setup link's page names the first admin, shows a taken name's refusal, and logs the admin in", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const { calls, loggedIn, refusal } = await namedTakenThenFree();

  expect(refusal).toBe(
    "Couldn't set up the admin (identity_exists): The name web-setup-taken is taken. Choose another.",
  );
  expect(calls).toStrictEqual([
    [{ name: "web-setup-taken", secret: "cookout_setup-secret" }],
    [{ displayName: "Grace", name: "web-setup-admin", secret: "cookout_setup-secret" }],
  ]);
  expect(loggedIn).toMatchObject({ identity: { name: "web-setup-admin" }, status: "logged-in" });
});

it("a setup link the server doesn't have says so, with a way to log in, not an error", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({
    client: anonymousClient(),
    hash: "#/setup-link/cookout_not-a-setup-link",
    session: sessionOf(anonymousClient()),
  });
  await screen.findByRole("heading", { name: "Set up your cookout" });
  filledIn("web-setup-gone", "");
  const heading = await screen.findByRole("heading", { name: "This setup link has expired or was already used" });
  const logIn = inPane().getByRole("link", { name: "Log in" });

  expect([heading.textContent, logIn.getAttribute("href"), alertsShown()]).toStrictEqual([
    "This setup link has expired or was already used",
    "#/login",
    [],
  ]);

  close();
});
