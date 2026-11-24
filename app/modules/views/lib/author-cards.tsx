import { IdentityCards, PersonKeysArea } from "../../design-system/index.tsx";
import type { BoardStore } from "../../board/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { createIdentityCards } from "./identity-cards.ts";
import { personKeysOf } from "./person-keys.ts";
import { useMemo } from "react";

interface AuthorCardsProps {
  readonly boardStore: BoardStore;
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function AuthorCards(props: AuthorCardsProps): ReactNode {
  const { boardStore, keymap } = props;
  const cards = useMemo(() => createIdentityCards(boardStore), [boardStore]);
  const keys = useMemo(() => personKeysOf(keymap), [keymap]);
  return (
    <IdentityCards value={cards}>
      <PersonKeysArea keys={keys}>{props.children}</PersonKeysArea>
    </IdentityCards>
  );
}
