import { useMemo, useSyncExternalStore } from "react";
import type { Identity } from "../../sdk/index.ts";
import { identityList } from "../../board/index.ts";
import { isFeeder } from "../../identities/feeders.ts";
import { useBoardStore } from "./use-board.ts";

const BETWEEN = " ";

function joinedFeeders(listed: readonly Identity[]): string {
  return listed
    .filter((identity) => isFeeder(identity))
    .map((identity) => identity.name)
    .join(BETWEEN);
}

function namesIn(joined: string): readonly string[] {
  if (joined === "") {
    return [];
  }
  return joined.split(BETWEEN);
}

export function useFeederNames(): readonly string[] {
  const store = useBoardStore();
  const joined = useSyncExternalStore(store.subscribeShowing("identities"), () =>
    joinedFeeders(identityList(store.snapshot())),
  );
  return useMemo(() => namesIn(joined), [joined]);
}
