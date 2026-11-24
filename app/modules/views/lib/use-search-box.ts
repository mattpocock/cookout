import type { Search, SearchState } from "../../search/web.ts";
import { useEffect, useRef } from "react";
import type { Keymap } from "../../keymap/index.ts";
import type { RefObject } from "react";
import type { SearchResult } from "../../sdk/index.ts";
import { hrefOf } from "../../paths/index.ts";

const NEAR_END_PX = 48;
const CAPTURE = { capture: true } as const;
const ONE = 1;

interface Place {
  readonly search: Search;
  readonly area: () => HTMLDivElement | null;
  readonly box: () => HTMLInputElement | null;
  readonly back: () => unknown;
  readonly remember: (element: unknown) => void;
}

type Listener = (event: Readonly<Event>) => void;

function searchHrefOf({ message }: SearchResult): string {
  if (message.kind === "reply") {
    return hrefOf({ channel: message.channel, message: message.id, name: "thread", thread: message.replyTo });
  }
  return hrefOf({ channel: message.channel, name: "thread", thread: message.id });
}

function highlightedOf(state: SearchState): readonly SearchResult[] {
  if (state.found.status !== "found" || state.highlighted === null) {
    return [];
  }
  return state.found.results.slice(state.highlighted, state.highlighted + ONE);
}

function present<Element>(element: Element | null): readonly Element[] {
  return [element].filter((each): each is Element => each !== null);
}

function focusable(element: unknown): readonly HTMLElement[] {
  return [element].filter((each): each is HTMLElement => each instanceof HTMLElement);
}

function isInside(place: Place, event: Readonly<Event>): boolean {
  const area = place.area();
  return event.composedPath().some((target) => target === area);
}

function isLink(event: Readonly<Event>): boolean {
  return event.composedPath().some((target) => target instanceof HTMLAnchorElement);
}

function goBack(place: Place): void {
  const before = place.back();
  place.remember(null);
  for (const box of present(place.box())) {
    box.blur();
  }
  for (const element of focusable(before)) {
    element.focus();
  }
}

function choose(place: Place): void {
  for (const chosen of highlightedOf(place.search.snapshot())) {
    place.search.close();
    place.remember(null);
    globalThis.location.hash = searchHrefOf(chosen);
  }
}

function bindBox(place: Place, keymap: Keymap): () => void {
  const { search } = place;
  return keymap.bind({
    actions: {
      closeSearch: () => {
        search.close();
        goBack(place);
        return true;
      },
      highlightNext: () => {
        search.move("down");
        return true;
      },
      highlightPrevious: () => {
        search.move("up");
        return true;
      },
      openHighlighted: () => {
        choose(place);
        return true;
      },
    },
    scope: "search box",
    within: place.box,
  });
}

function bindOpen(place: Place, keymap: Keymap): () => void {
  return keymap.bind({
    actions: {
      openSearch: () => {
        for (const box of present(place.box())) {
          box.focus();
          box.select();
        }
        place.search.open();
        return true;
      },
    },
    scope: "everywhere",
  });
}

function typedOf(place: Place): Listener {
  return (event) => {
    for (const box of present(place.box())) {
      if (box === event.target) {
        place.search.edit(box.value);
      }
    }
  };
}

function focusedOf(place: Place): Listener {
  return (event) => {
    if (event.target === place.box()) {
      place.remember(Reflect.get(event, "relatedTarget"));
      place.search.open();
    } else if (!isInside(place, event)) {
      place.search.close();
    }
  };
}

function pointedOf(place: Place): Listener {
  return (event) => {
    if (!isInside(place, event)) {
      place.search.close();
    }
  };
}

function clickedOf(place: Place): Listener {
  return (event) => {
    if (isInside(place, event) && isLink(event)) {
      place.search.close();
      place.remember(null);
    }
  };
}

function isNearEnd(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.scrollTop + target.clientHeight >= target.scrollHeight - NEAR_END_PX;
}

function scrolledOf(place: Place): Listener {
  return (event) => {
    if (isNearEnd(event.target) && isInside(place, event)) {
      place.search.loadMore();
    }
  };
}

function on(type: keyof DocumentEventMap, listener: Listener): () => void {
  globalThis.document.addEventListener(type, listener, CAPTURE);
  return () => {
    globalThis.document.removeEventListener(type, listener, CAPTURE);
  };
}

function listen(place: Place, keymap: Keymap): () => void {
  const stops = [
    bindOpen(place, keymap),
    bindBox(place, keymap),
    on("input", typedOf(place)),
    on("focusin", focusedOf(place)),
    on("pointerdown", pointedOf(place)),
    on("click", clickedOf(place)),
    on("scroll", scrolledOf(place)),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function inputIn(area: () => HTMLDivElement | null): HTMLInputElement | null {
  const found = area();
  if (found === null) {
    return null;
  }
  return found.querySelector("input");
}

function useSearchBox({
  keymap,
  search,
}: {
  readonly keymap: Keymap;
  readonly search: Search;
}): RefObject<HTMLDivElement | null> {
  const area = useRef<HTMLDivElement>(null);
  const back = useRef<unknown>(null);
  useEffect(
    () =>
      listen(
        {
          area: () => area.current,
          back: () => back.current,
          box: () => inputIn(() => area.current),
          remember: (element) => {
            back.current = element;
          },
          search,
        },
        keymap,
      ),
    [keymap, search],
  );
  return area;
}

export { searchHrefOf, useSearchBox };
