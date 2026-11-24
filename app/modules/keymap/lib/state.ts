import type { ListedGroup } from "./list.ts";
import type { Platform } from "./chords.ts";
import { shortcutListOf } from "./list.ts";

interface KeymapState {
  readonly shortcutList: readonly ListedGroup[];
  readonly shortcutListOpen: boolean;
}

interface KeymapStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => KeymapState;
  readonly openShortcutList: () => void;
  readonly closeShortcutList: () => void;
}

function createKeymapStore(platform: Platform): KeymapStore {
  let state: KeymapState = { shortcutList: shortcutListOf(platform), shortcutListOpen: false };
  const listeners = new Set<() => void>();
  function setOpen(shortcutListOpen: boolean): void {
    state = { ...state, shortcutListOpen };
    for (const listener of listeners) {
      listener();
    }
  }
  return {
    closeShortcutList: () => {
      setOpen(false);
    },
    openShortcutList: () => {
      setOpen(true);
    },
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type KeymapStore, createKeymapStore };
