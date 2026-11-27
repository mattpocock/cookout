import { Button } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { send: "Send a login link" } as const;

interface LoginLinkButtonProps {
  readonly actions: IdentityActions;
}

export function LoginLinkButton(props: LoginLinkButtonProps): ReactNode {
  const { actions } = props;
  const { loginLink } = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleSend = actions.sendLoginLink;
  return (
    <Button disabled={loginLink.status === "sending"} onClick={handleSend}>
      {TEXT.send}
    </Button>
  );
}
