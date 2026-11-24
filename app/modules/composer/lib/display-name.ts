import type { IdentityName, Refusal } from "../../sdk/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

type SaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | (Refusal & { readonly status: "failed" });

interface DisplayNameSnapshot {
  readonly open: boolean;
  readonly text: string | null;
  readonly save: SaveState;
}

interface DisplayNameDraft {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => DisplayNameSnapshot;
  readonly edit: (text: string) => void;
  readonly save: (text: string) => void;
  readonly open: () => void;
  readonly close: () => void;
}

interface DisplayNameOptions {
  readonly set: (name: IdentityName, text: string | null) => Promise<void>;
  readonly list: IdentityList;
  readonly name: IdentityName;
  readonly ownNameClears: boolean;
}

interface Sent {
  readonly name: IdentityName;
  readonly ownNameClears: boolean;
  readonly text: string;
}

function sentOf(sent: Sent): string | null {
  const trimmed = sent.text.trim();
  if (trimmed === "" || (sent.ownNameClears && trimmed === String(sent.name))) {
    return null;
  }
  return trimmed;
}

function createDisplayName(options: DisplayNameOptions): DisplayNameDraft {
  const { list, name, ownNameClears, set } = options;
  const listeners = listenersOf(list.show);
  const CLOSED: DisplayNameSnapshot = { open: false, save: { status: "idle" }, text: null };
  let current = CLOSED;
  let saving = Promise.resolve();

  function publish(next: DisplayNameSnapshot): void {
    current = next;
    listeners.notify();
  }

  async function send(text: string): Promise<void> {
    try {
      await set(name, sentOf({ name, ownNameClears, text }));
      publish(CLOSED);
    } catch (error: unknown) {
      publish({ ...current, save: { ...refusalOf(error), status: "failed" }, text });
    }
  }

  async function sendAfter(previous: Promise<void>, text: string): Promise<void> {
    await previous;
    await send(text);
  }

  return {
    close: () => {
      if (current.save.status !== "saving") {
        publish(CLOSED);
      }
    },
    edit: (text) => {
      publish({ ...current, text });
    },
    open: () => {
      publish({ ...current, open: true });
    },
    save: (text) => {
      publish({ ...current, save: { status: "saving" }, text });
      saving = sendAfter(saving, text);
    },
    snapshot: () => current,
    subscribe: listeners.add,
  };
}

export { type DisplayNameDraft, createDisplayName };
