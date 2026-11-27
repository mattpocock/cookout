import type { CookoutClient, Identity, Refusal } from "../../sdk/index.ts";
import { createListeners } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";
import { setupLinkNotFound } from "../../logins/setup-links.ts";
import { token } from "../../identities/index.ts";

type SetupLinkOutcome =
  | { readonly status: "filling" | "redeeming" | "redeemed" | "gone" }
  | { readonly status: "refused"; readonly refusal: Refusal };

interface SetupLinkState {
  readonly name: string;
  readonly displayName: string;
  readonly outcome: SetupLinkOutcome;
}

type SetupLinkClient = Pick<CookoutClient, "redeemSetupLink">;

interface SetupLink {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SetupLinkState;
  readonly editName: (name: string) => void;
  readonly editDisplayName: (displayName: string) => void;
  readonly redeem: (secret: string) => void;
}

interface SetupLinkOptions {
  readonly client: SetupLinkClient;
  readonly loggedIn: (identity: Identity) => void;
}

const EMPTY: SetupLinkState = { displayName: "", name: "", outcome: { status: "filling" } };

function endedBy(error: unknown): SetupLinkOutcome {
  const refusal = refusalOf(error);
  if (refusal.code === setupLinkNotFound) {
    return { status: "gone" };
  }
  return { refusal, status: "refused" };
}

function displayNameSent(displayName: string): { readonly displayName?: string } {
  const trimmed = displayName.trim();
  if (trimmed === "") {
    return {};
  }
  return { displayName: trimmed };
}

async function after(previous: Promise<void>, step: (secret: string) => Promise<void>, secret: string): Promise<void> {
  await previous;
  await step(secret);
}

function createSetupLink(options: SetupLinkOptions): SetupLink {
  const listeners = createListeners();
  let current = EMPTY;
  let running: Promise<void> = Promise.resolve();
  function put(next: Partial<SetupLinkState>): void {
    current = { ...current, ...next };
    listeners.notify();
  }
  async function redeemNamed(secret: string): Promise<void> {
    put({ outcome: { status: "redeeming" } });
    try {
      const sent = { ...displayNameSent(current.displayName), name: current.name.trim(), secret: token(secret) };
      const { identity } = await options.client.redeemSetupLink(sent);
      options.loggedIn(identity);
      put({ outcome: { status: "redeemed" } });
    } catch (error: unknown) {
      put({ outcome: endedBy(error) });
    }
  }
  return {
    editDisplayName: (displayName) => {
      put({ displayName });
    },
    editName: (name) => {
      put({ name });
    },
    redeem: (secret) => {
      if (current.outcome.status !== "redeeming") {
        running = after(running, redeemNamed, secret);
      }
    },
    snapshot: () => current,
    subscribe: listeners.subscribe,
  };
}

export { type SetupLink, type SetupLinkClient, type SetupLinkState, createSetupLink };
