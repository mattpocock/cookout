import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inPane, inProfile } from "./regions.ts";
import { profileDot, readerOn } from "./presence.ts";
import { profileOpened } from "./view-opened.ts";

const FEEDER = "Feeder: only posts";

async function feederNamed(name: string): Promise<void> {
  await newIdentity({ kind: "agent", name, owner: "admin" });
  await adminClient().makeFeeder(name);
}

const ONE = 1;

function linkTo(name: string): readonly (boolean | string | null)[] {
  const link = inPane().getByRole("link", { name: `@${name}` });
  return [link.getAttribute("href"), link.querySelector(".text-muted-foreground") !== null];
}

async function isFeederNow(name: string): Promise<boolean> {
  const { identity } = await adminClient().getIdentity(name);
  return identity.kind === "agent" && identity.feeder === true;
}

async function pressAndConfirm(button: string, confirm: string): Promise<void> {
  fireEvent.click(await inProfile().findEnabledButton(button));
  await screen.findByRole("alertdialog");
  fireEvent.click(await inDialog().findByRole("button", { name: confirm }));
}

it("a typed @feeder in a message links to its profile, muted, without a mention's highlight", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await feederNamed("web-feeder-link-gh");
  await newIdentity({ kind: "agent", name: "web-feeder-link-bot", owner: "admin" });
  await adminClient().createChannel({ name: "web-feeder-link" });
  await adminClient().createMessage({
    channel: "web-feeder-link",
    text: "From @web-feeder-link-gh to @web-feeder-link-bot",
  });
  await readerOn({ hash: "#/channels/web-feeder-link", reader: "web-feeder-link-reader" });

  await inPane().findByRole("link", { name: "@web-feeder-link-gh" });

  expect([linkTo("web-feeder-link-gh"), linkTo("web-feeder-link-bot")]).toStrictEqual([
    ["#/channels/web-feeder-link?profile=web-feeder-link-gh", true],
    ["#/channels/web-feeder-link?profile=web-feeder-link-bot", false],
  ]);
});

it("the @-suggestions never offer a feeder", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await feederNamed("web-feeder-suggest-gh");
  await newIdentity({ kind: "agent", name: "web-feeder-suggest-gbot", owner: "admin" });
  await adminClient().createChannel({ name: "web-feeder-suggest" });
  await readerOn({ hash: "#/channels/web-feeder-suggest", reader: "web-feeder-suggest-reader" });

  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hi @web-feeder-suggest-g" } });
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });

  await expect(within(list).findAllByRole("option")).resolves.toHaveLength(ONE);
  expect(within(list).getByRole("option").textContent).toContain("web-feeder-suggest-gbot");
});

it("a feeder's profile dot has its own colour and says it only posts", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await feederNamed("web-feeder-dot-gh");
  const { close } = await profileOpened({ client: adminClient(), name: "web-feeder-dot-gh" });

  await expect(profileDot({ label: FEEDER, who: "web-feeder-dot-gh" })).resolves.toStrictEqual({
    presence: "feeder",
    tooltip: FEEDER,
  });

  close();
});

it("the profile makes an agent a feeder after asking, and makes it an agent again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-feeder-make-gh", owner: "admin" });
  const { close } = await profileOpened({ client: adminClient(), name: "web-feeder-make-gh" });

  await pressAndConfirm("Make feeder", "Make @web-feeder-make-gh a feeder");
  await inProfile().findEnabledButton("Make agent again");
  const made = await isFeederNow("web-feeder-make-gh");
  await pressAndConfirm("Make agent again", "Make @web-feeder-make-gh an agent");
  await waitFor(async () => {
    await expect(isFeederNow("web-feeder-make-gh")).resolves.toBe(false);
  });

  expect(made).toBe(true);

  close();
});
