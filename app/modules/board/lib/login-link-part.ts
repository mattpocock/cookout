import type { CookoutClient, Identity, Refusal } from "../../sdk/index.ts";
import { createListeners } from "./listeners.ts";
import { loginLinkNotFound } from "../../logins/index.ts";
import { refusalOf } from "../../sdk/index.ts";
import { token } from "../../identities/index.ts";

type LoginLinkState =
  | { readonly status: "redeeming" | "redeemed" | "gone" }
  | { readonly status: "refused"; readonly refusal: Refusal };

type LoginLinkClient = Pick<CookoutClient, "redeemLoginLink">;

interface LoginLink {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => LoginLinkState;
  readonly redeem: (secret: string) => void;
}

interface LoginLinkOptions {
  readonly client: LoginLinkClient;
  readonly loggedIn: (identity: Identity) => void;
}

const REDEEMING: LoginLinkState = { status: "redeeming" };

function endedBy(error: unknown): LoginLinkState {
  const refusal = refusalOf(error);
  if (refusal.code === loginLinkNotFound) {
    return { status: "gone" };
  }
  return { refusal, status: "refused" };
}

async function after(previous: Promise<void>, step: (secret: string) => Promise<void>, secret: string): Promise<void> {
  await previous;
  await step(secret);
}

function createLoginLink(options: LoginLinkOptions): LoginLink {
  const listeners = createListeners();
  let current = REDEEMING;
  let redeemed: string | null = null;
  let running: Promise<void> = Promise.resolve();
  function put(next: LoginLinkState): void {
    current = next;
    listeners.notify();
  }
  async function redeemOnce(secret: string): Promise<void> {
    put(REDEEMING);
    try {
      const { identity } = await options.client.redeemLoginLink(token(secret));
      options.loggedIn(identity);
      put({ status: "redeemed" });
    } catch (error: unknown) {
      put(endedBy(error));
    }
  }
  return {
    redeem: (secret) => {
      if (redeemed !== secret) {
        redeemed = secret;
        running = after(running, redeemOnce, secret);
      }
    },
    snapshot: () => current,
    subscribe: listeners.subscribe,
  };
}

export { type LoginLink, type LoginLinkClient, type LoginLinkState, createLoginLink };
