import { aheadOf, boxOptionsOf } from "./search-options.ts";
import { useCallback, useEffect, useRef } from "react";
import type { Board } from "../../board/index.ts";
import type { BoxOption } from "./search-options.ts";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { RefObject } from "react";
import type { Search } from "../../search/web.ts";

const NEAR_END_PX = 48;
const CAPTURE = { capture: true } as const;
const ONE = 1;

interface SearchBox {
  readonly area: RefObject<HTMLDivElement | null>;
  readonly choose: (href: string) => void;
}

interface SearchBoxStores {
  readonly board: Board;
  readonly box: string;
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly search: Search;
}

interface Place {
  readonly search: Search;
  readonly options: () => readonly BoxOption[];
  readonly area: () => HTMLDivElement | null;
  readonly box: () => Element | null;
  readonly back: () => unknown;
  readonly remember: (element: unknown) => void;
}

type Listener = (event: Readonly<Event>) => void;

function inputs(element: unknown): readonly HTMLInputElement[] {
  return [element].filter((each): each is HTMLInputElement => each instanceof HTMLInputElement);
}

function focusable(element: unknown): readonly HTMLElement[] {
  return [element].filter((each): each is HTMLElement => each instanceof HTMLElement);
}

function isInside(place: Place, event: Readonly<Event>): boolean {
  const area = place.area();
  return event.composedPath().some((target) => target === area);
}

function goBack(place: Place): void {
  const before = place.back();
  place.remember(null);
  for (const box of inputs(place.box())) {
    box.blur();
  }
  for (const element of focusable(before)) {
    element.focus();
  }
}

function go(place: Place, href: string): void {
  place.search.close();
  place.remember(null);
  globalThis.location.hash = href;
}

function chooseHighlighted(place: Place): void {
  const { highlighted } = place.search.snapshot();
  for (const chosen of place.options().slice(highlighted, highlighted + ONE)) {
    go(place, chosen.href);
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
        search.move("down", aheadOf(place.options()));
        return true;
      },
      highlightPrevious: () => {
        search.move("up", aheadOf(place.options()));
        return true;
      },
      openHighlighted: () => {
        chooseHighlighted(place);
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
        for (const box of inputs(place.box())) {
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
    for (const box of inputs(place.box())) {
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
    on("scroll", scrolledOf(place)),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function useSearchBox({ board, box, identities, keymap, search }: SearchBoxStores): SearchBox {
  const area = useRef<HTMLDivElement>(null);
  const back = useRef<unknown>(null);
  const place = useCallback(
    (): Place => ({
      area: () => area.current,
      back: () => back.current,
      box: () => globalThis.document.querySelector(`[id="${box}"]`),
      options: () =>
        boxOptionsOf({
          channels: board.snapshot().channels,
          identities: identities.snapshot(),
          state: search.snapshot(),
        }),
      remember: (element) => {
        back.current = element;
      },
      search,
    }),
    [board, box, identities, search],
  );
  useEffect(() => listen(place(), keymap), [keymap, place]);
  const choose = useCallback(
    (href: string) => {
      go(place(), href);
    },
    [place],
  );
  return { area, choose };
}

export { useSearchBox };
