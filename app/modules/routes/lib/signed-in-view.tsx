import type { Identity, IdentityName } from "../../sdk/index.ts";
import { KeyAnnouncements, MessageDeleteConfirm, SidebarKeys, SidebarView } from "../../views/index.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { Workspace } from "../../design-system/layout.tsx";
import { WorkspaceBody } from "./workspace-body.tsx";
import { useSyncExternalStore } from "react";

interface SignedInViewProps {
  readonly identity: Identity;
  readonly profile: IdentityName | null;
  readonly route: Route;
  readonly stores: Stores;
}

export function SignedInView(props: SignedInViewProps): ReactNode {
  const { stores } = props;
  const { layout } = stores;
  const { sidebar } = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleToggle = layout.toggleSidebar;
  return (
    <Workspace onToggleSidebar={handleToggle} sidebarOpen={sidebar}>
      <SidebarView
        creation={stores.channelCreation}
        identity={props.identity}
        keymap={stores.keymap}
        layout={layout}
        route={props.route}
        unread={stores.unread}
      />
      <SidebarKeys keymap={stores.keymap} layout={layout} me={props.identity.name} unread={stores.unread} />
      <KeyAnnouncements keymap={stores.keymap} />
      <MessageDeleteConfirm />
      <WorkspaceBody
        me={props.identity.name}
        profile={props.profile}
        route={props.route}
        sidebarOpen={sidebar}
        stores={stores}
      />
    </Workspace>
  );
}
