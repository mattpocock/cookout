import { adminClient, anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inPane, inProfile } from "./regions.ts";
import type { Mock } from "vitest";
import { alertSaying } from "./alerts.ts";
import { openAt } from "./render.tsx";
import { profileOpened } from "./view-opened.ts";
import { unreachableClient } from "../../testing/index.ts";

const SEND = "Send a login link";

function stubClipboard(): Mock<(text: string) => Promise<void>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

interface Opened {
  readonly send: () => Promise<void>;
  readonly close: () => void;
}

async function profileOf(prefix: string): Promise<Opened> {
  const viewer = await newIdentity({ kind: "human", name: `${prefix}-viewer` });
  await adminClient().makeAdmin(`${prefix}-viewer`);
  await newIdentity({ kind: "human", name: `${prefix}-human` });
  const { answered, close } = await profileOpened({ client: viewer.client, name: `${prefix}-human` });
  const send = await inProfile().findByRole("button", { name: SEND });
  return {
    close,
    send: async () => {
      fireEvent.click(send);
      await answered("createLoginLink");
    },
  };
}

it("copy link puts the shown login link on the clipboard", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { close, send } = await profileOf("web-link-copy");
  await send();
  const { textContent: link } = await screen.findByLabelText("Login link");
  fireEvent.click(inProfile().getByRole("button", { name: "Copy link" }));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(link);
  });

  close();
});

it("a refused login link says why in the profile, and shows no link", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, send } = await profileOf("web-link-refused");
  await adminClient().removeAdmin("web-link-refused-viewer");
  await send();
  const { textContent } = await alertSaying("Couldn't send a login link (admin_only)");

  expect([textContent, screen.queryByLabelText("Login link")]).toStrictEqual([
    expect.stringMatching(/^Couldn't send a login link \(admin_only\): /u),
    null,
  ]);

  close();
});

it("a login link the server can't redeem for another reason says so, with a way to log in", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const unreachable = unreachableClient({ token: "cookout_any" });
  const close = openAt({
    client: anonymousClient(),
    hash: "#/login-link/cookout_any-link",
    session: sessionOf({ ...anonymousClient(), redeemLoginLink: unreachable.redeemLoginLink }),
  });
  await screen.findByRole("heading", { name: "This login link didn't log you in" });
  const { textContent } = await alertSaying("Couldn't log in (unreachable)");

  expect([textContent, inPane().getByRole("link", { name: "Log in" }).getAttribute("href")]).toStrictEqual([
    expect.stringMatching(/^Couldn't log in \(unreachable\): /u),
    "#/login",
  ]);

  close();
});
