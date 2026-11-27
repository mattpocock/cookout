import { AppShell } from "../../design-system/layout.tsx";
import type { LinkRoute } from "../../paths/index.ts";
import { LoginLinkView } from "./login-link-view.tsx";
import type { ReactNode } from "react";
import type { Session } from "../../board/index.ts";
import { SetupLinkView } from "./setup-link-view.tsx";

interface LinkRouteViewProps {
  readonly route: LinkRoute;
  readonly session: Session;
}

export function LinkRouteView(props: LinkRouteViewProps): ReactNode {
  const { route, session } = props;
  if (route.name === "setup-link") {
    return (
      <AppShell>
        <SetupLinkView secret={route.secret} session={session} />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <LoginLinkView secret={route.secret} session={session} />
    </AppShell>
  );
}
