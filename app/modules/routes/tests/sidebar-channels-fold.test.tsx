import { expect, it } from "vitest";
import { adminClient } from "./identities.ts";
import { fireEvent } from "@testing-library/react";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";

const CHANNEL = "web-fold-channels";

function channelShown(): boolean {
  return inSidebar().queryByRole("link", { name: `#${CHANNEL}` }) !== null;
}

async function foldThenLeave(): Promise<boolean> {
  const close = openAt({ client: adminClient(), hash: "#/" });
  await inSidebar().findByRole("link", { name: `#${CHANNEL}` });
  fireEvent.click(inSidebar().getByRole("button", { name: "Channels" }));
  const shown = channelShown();
  close();
  return shown;
}

it("the Channels heading folds its channels away, a reload keeps them folded, and it unfolds them again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: CHANNEL });
  const shownFolded = await foldThenLeave();
  const close = openAt({ client: adminClient(), hash: "#/" });
  const heading = await inSidebar().findByRole("button", { name: "Channels" });
  const afterReload = [heading.getAttribute("aria-expanded"), channelShown()];
  fireEvent.click(heading);
  const unfolded = await inSidebar().findByRole("link", { name: `#${CHANNEL}` });

  expect([
    shownFolded,
    ...afterReload,
    heading.getAttribute("aria-expanded"),
    unfolded.getAttribute("href"),
  ]).toStrictEqual([false, "false", false, "true", `#/channels/${CHANNEL}`]);

  close();
});
