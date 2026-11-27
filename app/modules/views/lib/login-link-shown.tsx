import { Alert, Muted } from "../../design-system/content.tsx";
import { Button, ButtonRow, TokenText } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { timeOf } from "../../format/index.ts";
import { useSyncExternalStore } from "react";

const TEXT = { copy: "Copy link", done: "Done", label: "Login link" } as const;

interface LoginLinkShownProps {
  readonly actions: IdentityActions;
  readonly name: IdentityName;
}

function warningOf(name: IdentityName, expiresAt: string): string {
  return `It logs @${name} in once and expires in 15 minutes, at ${timeOf(expiresAt).full}. Copy it now: it isn't shown again.`;
}

export function LoginLinkShown(props: LoginLinkShownProps): ReactNode {
  const { actions } = props;
  const { loginLink } = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleCopy = actions.copyLoginLink;
  const handleDone = actions.forgetLoginLink;
  if (loginLink.status === "failed") {
    return <Alert>{`Couldn't send a login link (${loginLink.code}): ${loginLink.message}`}</Alert>;
  }
  if (loginLink.status !== "shown") {
    return null;
  }
  return (
    <>
      <TokenText label={TEXT.label} token={loginLink.link} />
      <Muted>{warningOf(props.name, loginLink.expiresAt)}</Muted>
      <ButtonRow>
        <Button focused onClick={handleCopy}>
          {TEXT.copy}
        </Button>
        <Button onClick={handleDone}>{TEXT.done}</Button>
      </ButtonRow>
    </>
  );
}
