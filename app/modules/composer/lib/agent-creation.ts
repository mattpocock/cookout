import type { IdentityName, Refusal, Token } from "../../sdk/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

type CreateState =
  | { readonly status: "idle" }
  | { readonly status: "creating" }
  | (Refusal & { readonly status: "failed" });

interface AgentCreationSnapshot {
  readonly open: boolean;
  readonly text: string;
  readonly create: CreateState;
}

interface AgentCreation {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AgentCreationSnapshot;
  readonly edit: (text: string) => void;
  readonly create: () => void;
  readonly open: () => void;
  readonly close: () => void;
}

interface AgentCreationOptions {
  readonly list: IdentityList;
  readonly created: (name: IdentityName, token: Token) => void;
}

function createAgentCreation(options: AgentCreationOptions): AgentCreation {
  const listeners = listenersOf(options.list.show);
  const CLOSED: AgentCreationSnapshot = { create: { status: "idle" }, open: false, text: "" };
  let current = CLOSED;
  let queue = Promise.resolve();

  function publish(next: AgentCreationSnapshot): void {
    current = next;
    listeners.notify();
  }

  async function sendAfter(previous: Promise<void>, text: string): Promise<void> {
    await previous;
    try {
      const { name, token } = await options.list.calls.createAgent(text.trim());
      options.created(name, token);
      publish(CLOSED);
    } catch (error: unknown) {
      publish({ create: { ...refusalOf(error), status: "failed" }, open: true, text });
    }
  }

  return {
    close: () => {
      if (current.create.status !== "creating") {
        publish(CLOSED);
      }
    },
    create: () => {
      const { text } = current;
      publish({ create: { status: "creating" }, open: true, text });
      queue = sendAfter(queue, text);
    },
    edit: (text) => {
      publish({ ...current, text });
    },
    open: () => {
      publish({ ...current, open: true });
    },
    snapshot: () => current,
    subscribe: listeners.add,
  };
}

export { type AgentCreation, createAgentCreation };
