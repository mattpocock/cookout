import { expect, it, vi } from "vitest";
import { opened, postedIn } from "./held-store.ts";
import type { BoardStore } from "../index.ts";
import type { MessageId } from "../../sdk/index.ts";
import { titleAsked } from "../index.ts";

type Step = (store: BoardStore) => void;

interface Asked {
  readonly heard: boolean;
  readonly seen: readonly (MessageId | null)[];
}

function askedAfter(steps: readonly Step[]): Asked {
  const { store } = opened();
  const listener = vi.fn<() => void>();
  const unsubscribe = store.subscribe(listener);
  const seen = [titleAsked(store.snapshot())];
  for (const step of steps) {
    step(store);
    seen.push(titleAsked(store.snapshot()));
  }
  unsubscribe();
  return { heard: listener.mock.calls.length >= steps.length, seen };
}

function asking(id: MessageId): Step {
  return (store): void => {
    store.calls.askTitle(id);
  };
}

function taking(store: BoardStore): void {
  store.calls.takeTitle();
}

it("asking for a thread's title form holds its thread until it is taken, telling the store's listeners", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const [first, second] = await Promise.all([postedIn("web-title-asked"), postedIn("web-title-asked-other")]);
  const asked = askedAfter([asking(first.id), asking(second.id), taking]);

  expect(asked).toStrictEqual({ heard: true, seen: [null, first.id, second.id, null] });
});
