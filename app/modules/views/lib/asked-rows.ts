interface AskedRows<Id extends number, Entry extends { readonly id: Id }> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => readonly Entry[];
  readonly ask: (entry: Entry) => void;
  readonly closed: (id: Id) => void;
}

interface Shown<Id extends number, Entry extends { readonly id: Id }> {
  readonly entries: readonly Entry[];
  readonly asked: readonly Entry[];
}

function shownWith<Id extends number, Entry extends { readonly id: Id }>({
  asked,
  entries,
}: Shown<Id, Entry>): readonly Entry[] {
  const left = asked.filter(({ id }) => !entries.some((entry) => entry.id === id));
  return [...entries, ...left].toSorted((first, second) => second.id - first.id);
}

function createAskedRows<Id extends number, Entry extends { readonly id: Id }>(): AskedRows<Id, Entry> {
  const listeners = new Set<() => void>();
  let asked: readonly Entry[] = [];
  function set(next: readonly Entry[]): void {
    asked = next;
    for (const listener of listeners) {
      listener();
    }
  }
  return {
    ask: (entry) => {
      set([entry]);
    },
    closed: (id) => {
      set(asked.filter((entry) => entry.id !== id));
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

export { createAskedRows, shownWith };
export type { AskedRows };
