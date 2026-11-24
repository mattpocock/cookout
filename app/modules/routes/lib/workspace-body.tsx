import { IdentityDeletedNotice, MessageListKeys, ReconnectingView, SearchableMain } from "../../views/index.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { WorkspaceColumn } from "../../design-system/index.tsx";
import { WorkspacePanes } from "./workspace-panes.tsx";

interface WorkspaceBodyProps {
  readonly me: IdentityName;
  readonly profile: IdentityName | null;
  readonly route: Route;
  readonly stores: Stores;
}

export function WorkspaceBody(props: WorkspaceBodyProps): ReactNode {
  const { stores } = props;
  return (
    <WorkspaceColumn>
      <MessageListKeys keymap={stores.keymap} />
      {stores.live !== null && <ReconnectingView live={stores.live} />}
      <IdentityDeletedNotice identities={stores.composer.identities} />
      <SearchableMain
        board={stores.board}
        identities={stores.composer.identities}
        keymap={stores.keymap}
        layout={stores.layout}
        search={stores.search}
      >
        <WorkspacePanes me={props.me} profile={props.profile} route={props.route} stores={stores} />
      </SearchableMain>
    </WorkspaceColumn>
  );
}
