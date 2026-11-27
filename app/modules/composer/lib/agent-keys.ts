import type { IdentityName, Refusal, Token } from "../../sdk/index.ts";
import type { AgentKeyView } from "../../logins/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { refusalOf } from "../../sdk/index.ts";

type KeyStep = { readonly status: "idle" } | { readonly status: "sending" } | (Refusal & { readonly status: "failed" });

interface MadeKey {
  readonly name: string;
  readonly token: Token;
}

interface AgentKeysSnapshot {
  readonly keys: readonly AgentKeyView[] | null;
  readonly listing: KeyStep;
  readonly keyName: string;
  readonly expiresIn: string;
  readonly making: KeyStep;
  readonly made: MadeKey | null;
  readonly forgotten: string | null;
  readonly asked: AgentKeyView | null;
  readonly revoking: KeyStep;
}

interface AgentKeys {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AgentKeysSnapshot;
  readonly editName: (text: string) => void;
  readonly editExpiry: (text: string) => void;
  readonly make: () => void;
  readonly copy: () => void;
  readonly forget: () => void;
  readonly askRevoke: (key: AgentKeyView) => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

interface AgentKeysOptions {
  readonly list: IdentityList;
  readonly name: IdentityName;
}

const NONE = 0;
const IDLE: KeyStep = { status: "idle" };
const SENDING: KeyStep = { status: "sending" };

const START: AgentKeysSnapshot = {
  asked: null,
  expiresIn: "",
  forgotten: null,
  keyName: "",
  keys: null,
  listing: IDLE,
  made: null,
  making: IDLE,
  revoking: IDLE,
};

type Publish = (next: Partial<AgentKeysSnapshot>) => void;

interface Held {
  readonly current: () => AgentKeysSnapshot;
  readonly publish: Publish;
}

function failed(error: unknown): KeyStep {
  return { ...refusalOf(error), status: "failed" };
}

function expiryOf(text: string): { readonly expiresIn?: string } {
  const expiresIn = text.trim();
  if (expiresIn === "") {
    return {};
  }
  return { expiresIn };
}

interface Steps {
  readonly load: () => Promise<void>;
  readonly make: () => Promise<void>;
  readonly revoke: () => Promise<void>;
}

function stepsOf({ list, name }: AgentKeysOptions, { current, publish }: Held): Steps {
  const { calls } = list;
  async function load(): Promise<void> {
    try {
      publish({ keys: await calls.listKeys(name), listing: IDLE });
    } catch (error: unknown) {
      publish({ listing: failed(error) });
    }
  }
  return {
    load,
    make: async () => {
      const { expiresIn, keyName } = current();
      publish({ making: SENDING });
      try {
        const { token } = await calls.makeKey(name, { name: keyName.trim(), ...expiryOf(expiresIn) });
        await load();
        publish({ expiresIn: "", keyName: "", made: { name: keyName.trim(), token }, making: IDLE });
      } catch (error: unknown) {
        publish({ making: failed(error) });
      }
    },
    revoke: async () => {
      const { asked } = current();
      if (asked === null) {
        return;
      }
      publish({ revoking: SENDING });
      try {
        await calls.revokeKey(name, asked.id);
        await load();
        publish({ asked: null, revoking: IDLE });
      } catch (error: unknown) {
        publish({ revoking: failed(error) });
      }
    },
  };
}

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

interface Store extends Held {
  readonly add: (listener: () => void) => () => void;
  readonly readers: () => number;
}

function storeOf(): Store {
  const listeners = new Set<() => void>();
  let current = START;
  return {
    add: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === NONE) {
          current = { ...current, asked: null, made: null };
        }
      };
    },
    current: () => current,
    publish: (next) => {
      current = { ...current, forgotten: null, ...next };
      for (const listener of listeners) {
        listener();
      }
    },
    readers: () => listeners.size,
  };
}

type Edits = Pick<AgentKeys, "askRevoke" | "cancel" | "editExpiry" | "editName" | "forget">;

function editsOf({ current, publish }: Held): Edits {
  return {
    askRevoke: (key) => {
      publish({ asked: key, revoking: IDLE });
    },
    cancel: () => {
      if (current().revoking.status !== "sending") {
        publish({ asked: null, revoking: IDLE });
      }
    },
    editExpiry: (expiresIn) => {
      publish({ expiresIn });
    },
    editName: (keyName) => {
      publish({ keyName });
    },
    forget: () => {
      const { name } = current().made ?? { name: null };
      publish({ forgotten: name, made: null });
    },
  };
}

function copierOf({ current }: Held): () => void {
  let copying = Promise.resolve();
  return () => {
    const { made } = current();
    copying = after(copying, async () => {
      if (made !== null) {
        await globalThis.navigator.clipboard.writeText(made.token);
      }
    });
  };
}

function createAgentKeys(options: AgentKeysOptions): AgentKeys {
  const store = storeOf();
  const steps = stepsOf(options, store);
  let queue = Promise.resolve();
  function queued(step: () => Promise<void>): () => void {
    return () => {
      queue = after(queue, step);
    };
  }
  const load = queued(steps.load);
  return {
    ...editsOf(store),
    confirm: queued(steps.revoke),
    copy: copierOf(store),
    make: queued(steps.make),
    snapshot: store.current,
    subscribe: (listener) => {
      if (store.readers() === NONE) {
        load();
      }
      return store.add(listener);
    },
  };
}

export { type AgentKeys, type AgentKeysSnapshot, createAgentKeys };
