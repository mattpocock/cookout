import type { LoginLinkState, Session } from "../../board/index.ts";
import { useEffect, useSyncExternalStore } from "react";
import { hrefOf } from "../../paths/index.ts";

interface Redeeming {
  readonly session: Session;
  readonly secret: string;
}

function useLoginLink({ secret, session }: Redeeming): LoginLinkState {
  const { loginLink } = session;
  const state = useSyncExternalStore(loginLink.subscribe, loginLink.snapshot);
  useEffect(() => {
    loginLink.redeem(secret);
  }, [loginLink, secret]);
  useEffect(() => {
    if (state.status === "redeemed") {
      globalThis.location.replace(hrefOf({ name: "inbox", selected: null }));
    }
  }, [state]);
  return state;
}

export { useLoginLink };
