import type { Act } from "../../keymap/index.ts";

const FEED = '[role="feed"]';
const ITEM = "article";
const FOLD = "article[data-closed-fold]";
const UNKNOWN_SIZE = "-1";
const FIRST = 0;
const STEP = 1;
const NOT_FOUND = -1;

type Move = "first" | "last" | "next" | "previous";

interface Place {
  readonly feed: HTMLElement;
  readonly items: readonly HTMLElement[];
  readonly at: number;
}

function placeOf(): Place | null {
  const feed = globalThis.document.querySelector<HTMLElement>(`${FEED}:focus-within`);
  if (feed === null) {
    return null;
  }
  const items = [...feed.querySelectorAll<HTMLElement>(ITEM)];
  let at = NOT_FOUND;
  for (const [index, item] of items.entries()) {
    if (item.matches(":focus-within")) {
      at = index;
    }
  }
  return { at, feed, items };
}

function indexAfter(move: Move, at: number, count: number): number {
  if (move === "first") {
    return FIRST;
  }
  if (move === "last") {
    return count - STEP;
  }
  if (move === "next") {
    return at + STEP;
  }
  return at - STEP;
}

function olderButtonOf(): HTMLButtonElement | null {
  const place = placeOf();
  if (
    place === null ||
    place.feed.id === "" ||
    place.feed.querySelector(`${ITEM}[aria-setsize="${UNKNOWN_SIZE}"]`) === null
  ) {
    return null;
  }
  return globalThis.document.querySelector<HTMLButtonElement>(`button[aria-controls="${place.feed.id}"]:enabled`);
}

function loadOlder(move: Move): void {
  const older = olderButtonOf();
  if (move === "previous" && older !== null) {
    older.click();
  }
}

function moving(move: Move): Act {
  return () => {
    const place = placeOf();
    if (place === null) {
      return false;
    }
    const item = place.items[indexAfter(move, place.at, place.items.length)] ?? null;
    if (item === null) {
      loadOlder(move);
    } else {
      item.focus();
    }
    return true;
  };
}

function unfold({ target }: KeyboardEvent): boolean {
  if (!(target instanceof HTMLElement) || !target.matches(FOLD) || target.closest(FEED) === null) {
    return false;
  }
  for (const button of target.querySelectorAll("button")) {
    button.click();
  }
  return true;
}

const MESSAGE_LIST_ACTIONS = {
  firstMessage: moving("first"),
  lastMessage: moving("last"),
  nextMessage: moving("next"),
  previousMessage: moving("previous"),
  unfoldClosed: unfold,
} as const satisfies Readonly<Record<string, Act>>;

export { MESSAGE_LIST_ACTIONS };
