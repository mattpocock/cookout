import { useContext, useSyncExternalStore } from "react";
import { AuthorList } from "./author-list.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { identityList } from "../../board/index.ts";

function useSavedName(name: IdentityName): string | null {
  const store = useContext(AuthorList);
  const listed = useSyncExternalStore(store.subscribeShowing("identities"), () => identityList(store.snapshot()));
  for (const identity of listed) {
    if (identity.name === name) {
      return identity.displayName ?? null;
    }
  }
  return null;
}

export { useSavedName };
