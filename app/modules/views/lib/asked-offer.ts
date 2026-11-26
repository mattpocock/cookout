import type { DeactivationOffer, DeactivationOfferId } from "../../sdk/index.ts";

interface AskedOffer {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => DeactivationOffer | null;
  readonly ask: (offer: DeactivationOffer) => void;
  readonly closed: (id: DeactivationOfferId) => void;
}

interface Shown {
  readonly offers: readonly DeactivationOffer[];
  readonly asked: DeactivationOffer | null;
}

function shownWith({ asked, offers }: Shown): readonly DeactivationOffer[] {
  if (asked === null || offers.some(({ id }) => id === asked.id)) {
    return offers;
  }
  return [...offers, asked].toSorted((first, second) => second.id - first.id);
}

function createAskedOffer(): AskedOffer {
  const listeners = new Set<() => void>();
  let asked: DeactivationOffer | null = null;
  function set(next: DeactivationOffer | null): void {
    asked = next;
    for (const listener of listeners) {
      listener();
    }
  }
  return {
    ask: set,
    closed: (id) => {
      const now = asked;
      if (now === null) {
        return;
      }
      if (now.id === id) {
        set(null);
      }
    },
    snapshot: () => asked,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { createAskedOffer, shownWith };
export type { AskedOffer };
