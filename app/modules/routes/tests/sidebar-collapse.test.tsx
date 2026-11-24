import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

function sidebarShown(): boolean {
  return screen.queryByRole("navigation", { name: "Sidebar" }) !== null;
}

async function collapseThenLeave(): Promise<boolean> {
  const close = openAt({ client: adminClient(), hash: "#/" });
  fireEvent.click(await inSidebar().findByRole("button", { name: "Collapse sidebar" }));
  const shown = sidebarShown();
  close();
  return shown;
}

it("the sidebar hides, stays hidden after a reload, and the top bar's button brings it back", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const shownCollapsed = await collapseThenLeave();
  const close = openAt({ client: adminClient(), hash: "#/" });
  const expand = await inPane().findByRole("button", { name: "Expand sidebar" });
  const shownAfterReload = sidebarShown();
  fireEvent.click(expand);

  expect([
    shownCollapsed,
    shownAfterReload,
    expand.getAttribute("aria-expanded"),
    sidebarShown(),
    inPane().queryByRole("button", { name: "Expand sidebar" }),
  ]).toStrictEqual([false, false, "false", true, null]);

  close();
});
