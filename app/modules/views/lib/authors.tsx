import { AuthorCards } from "./author-cards.tsx";
import { AuthorList } from "./author-list.ts";
import type { BoardStore } from "../../board/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { PresenceList } from "./presence-list.ts";
import type { ReactNode } from "react";

interface AuthorsProps {
  readonly boardStore: BoardStore;
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function Authors(props: AuthorsProps): ReactNode {
  const { boardStore } = props;
  return (
    <AuthorList value={boardStore}>
      <PresenceList value={boardStore}>
        <AuthorCards boardStore={boardStore} keymap={props.keymap}>
          {props.children}
        </AuthorCards>
      </PresenceList>
    </AuthorList>
  );
}
