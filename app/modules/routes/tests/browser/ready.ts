import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

interface NameIn {
  readonly within: Locator;
  readonly name: string;
}

export async function knownName({ name, within }: NameIn): Promise<Locator> {
  await expect(
    within.getByRole("button", { exact: true, includeHidden: true, name: `@${name} actions` }),
  ).toBeAttached();

  return within.getByRole("link", { exact: true, name });
}
