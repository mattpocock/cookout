import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { copied, copiesRecorded, walk } from "./walk.ts";
import { inPane, inProfile } from "./regions.ts";
import type { Step } from "./walk.ts";
import { test as base } from "@playwright/test";
import { createTestAgent } from "../../../testing/index.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Cast {
  readonly ada: string;
  readonly aide: string;
  readonly gone: string;
  readonly prefix: string;
  readonly viewer: string;
}

interface Walking {
  readonly cast: Cast;
  readonly page: Page;
}

interface Choice {
  readonly item: string;
  readonly of: string;
}

function row({ page }: Walking, label: string): Locator {
  return inPane(page)
    .getByRole("list", { exact: true, name: "Identities" })
    .getByRole("link", { exact: true, name: label });
}

function kind({ page }: Walking, label: string): Locator {
  return inPane(page)
    .getByRole("radiogroup", { exact: true, name: "Kind" })
    .getByRole("radio", { checked: true, exact: true, name: label });
}

function deactivatedChip({ page }: Walking, pressed: boolean): Locator {
  return inPane(page).getByRole("button", { exact: true, name: "Show deactivated", pressed });
}

function menuOf({ page }: Walking, name: string): Locator {
  return page.getByRole("menu", { exact: true, name: `@${name} actions` });
}

function choice(walking: Walking, { item, of }: Choice): Locator {
  return menuOf(walking, of).getByRole("menuitem", { exact: true, name: item });
}

function rows(walking: Walking): Readonly<Record<"ada" | "aide" | "gone" | "viewer", Locator>> {
  const { cast } = walking;
  return {
    ada: row(walking, `${cast.ada}, Offline`),
    aide: row(walking, `${cast.aide}, Offline`),
    gone: row(walking, `${cast.gone}, Offline`),
    viewer: row(walking, `${cast.viewer}, Online`),
  };
}

async function castOnPeople(page: Page): Promise<Cast> {
  const prefix = unique("browser-walk-people");
  const cast = {
    ada: `${prefix}-ada`,
    aide: `${prefix}-bot`,
    gone: `${prefix}-gone`,
    prefix,
    viewer: `${prefix}-viewer`,
  };
  const viewer = await newIdentity({ kind: "human", name: cast.viewer });
  await newIdentity({ kind: "human", name: cast.ada });
  await newIdentity({ kind: "human", name: cast.gone });
  await adminClient().deactivateIdentity(cast.gone);
  await createTestAgent({ by: viewer.client, displayName: cast.aide, name: cast.aide });
  await logIn({ page, token: viewer.token, url: "/#/people" });
  return cast;
}

function toolbarSteps(walking: Walking): readonly Step[] {
  const filter = inPane(walking.page).getByRole("textbox", { exact: true, name: "Filter by name" });
  const shown = rows(walking);
  return [
    {
      focused: filter,
      gone: [shown.gone],
      keys: walking.cast.prefix,
      shows: [shown.ada, shown.aide, shown.viewer],
      typed: true,
    },
    { focused: kind(walking, "All 3"), keys: "Tab" },
    { focused: kind(walking, "Humans 2"), gone: [shown.aide], keys: "ArrowRight" },
    { focused: kind(walking, "Agents 1"), gone: [shown.ada, shown.viewer], keys: "ArrowRight" },
    { focused: kind(walking, "Humans 2"), keys: "ArrowLeft" },
    { focused: kind(walking, "All 3"), keys: "ArrowLeft", shows: [shown.aide] },
    { focused: deactivatedChip(walking, false), keys: "Tab" },
    { focused: deactivatedChip(walking, true), keys: "Space", shows: [shown.gone] },
    { focused: deactivatedChip(walking, false), gone: [shown.gone], keys: "Enter" },
  ];
}

function rowSteps(walking: Walking): readonly Step[] {
  const { cast, page } = walking;
  const shown = rows(walking);
  return [
    { focused: shown.ada, keys: "Tab" },
    { focused: shown.aide, keys: "ArrowDown" },
    { focused: shown.ada, keys: "ArrowUp" },
    { focused: shown.ada, keys: "c", shows: [copied({ page, text: `@${cast.ada}` })] },
    { focused: choice(walking, { item: "View profile", of: cast.ada }), keys: "Shift+F10" },
    { focused: shown.ada, gone: [menuOf(walking, cast.ada)], keys: "Escape" },
    { focused: shown.aide, keys: "ArrowDown" },
    { focused: choice(walking, { item: "View profile", of: cast.aide }), keys: "Shift+F10" },
    { focused: choice(walking, { item: "Copy name", of: cast.aide }), keys: "ArrowDown" },
    { focused: shown.aide, keys: "Enter", shows: [copied({ page, text: `@${cast.aide}` })] },
  ];
}

function profileSteps(walking: Walking): readonly Step[] {
  const { cast, page } = walking;
  const shown = rows(walking);
  const owned = inProfile(page).getByText(`Agent · owned by ${cast.viewer}`, { exact: true });
  return [
    { focused: choice(walking, { item: "View profile", of: cast.aide }), keys: "Shift+F10" },
    { focused: shown.aide, keys: "Enter", shows: [owned] },
    { focused: shown.aide, gone: [inProfile(page)], keys: "Escape" },
    { focused: shown.aide, keys: "Enter", shows: [owned] },
    { focused: inProfile(page).getByRole("link", { exact: true, name: "Close profile" }), keys: "Tab" },
    { focused: shown.aide, gone: [inProfile(page)], keys: "Enter" },
  ];
}

test("People by keyboard alone: the filter field, the kind filter, Show deactivated, and every row and person action", async ({
  page,
}) => {
  await copiesRecorded(page);
  const walking = { cast: await castOnPeople(page), page };
  await inPane(page).getByRole("textbox", { exact: true, name: "Filter by name" }).focus();
  await walk({ page, steps: [...toolbarSteps(walking), ...rowSteps(walking), ...profileSteps(walking)] });
});
