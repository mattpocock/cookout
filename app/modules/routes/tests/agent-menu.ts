import { chose, pressed } from "./menus.ts";
import { screen, within } from "@testing-library/react";

async function agentCard(name: string): Promise<HTMLElement> {
  const card = await screen.findByRole("group", { name: `@${name}` });
  return card;
}

async function openMenuOf(name: string): Promise<void> {
  const card = await agentCard(name);
  pressed(() => within(card).getByRole("button", { name: "More actions" }));
}

interface Choice {
  readonly agent: string;
  readonly item: string;
}

async function choose(choice: Choice): Promise<void> {
  await openMenuOf(choice.agent);
  await chose(choice.item);
}

async function menuOf(name: string): Promise<readonly string[]> {
  await openMenuOf(name);
  const names: string[] = [];
  for (const item of await screen.findAllByRole("menuitem")) {
    names.push(item.textContent);
  }
  return names;
}

export { agentCard, choose, menuOf };
