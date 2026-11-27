import type { Session, SetupLinkState } from "../../board/index.ts";
import { useEffect, useSyncExternalStore } from "react";
import { hrefOf } from "../../paths/index.ts";

function useSetupLink(session: Session): SetupLinkState {
  const { setupLink } = session;
  const state = useSyncExternalStore(setupLink.subscribe, setupLink.snapshot);
  useEffect(() => {
    if (state.outcome.status === "redeemed") {
      globalThis.location.replace(hrefOf({ name: "inbox", selected: null }));
    }
  }, [state]);
  return state;
}

export { useSetupLink };
