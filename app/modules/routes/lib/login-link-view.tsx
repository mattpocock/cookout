import { Card, CardBody, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import type { LoginLinkState, Session } from "../../board/index.ts";
import { LoginLinkEnded } from "./login-link-ended.tsx";
import type { ReactNode } from "react";
import { useLoginLink } from "./use-login-link.ts";

const TEXT = { redeeming: "Logging you in…" } as const;

interface LoginLinkViewProps {
  readonly session: Session;
  readonly secret: string;
}

function isEnded(state: LoginLinkState): boolean {
  return state.status === "gone" || state.status === "refused";
}

export function LoginLinkView(props: LoginLinkViewProps): ReactNode {
  const state = useLoginLink(props);
  if (isEnded(state)) {
    return <LoginLinkEnded state={state} />;
  }
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.redeeming}</Heading>
      </CardHeader>
      <CardBody>
        <Muted>{TEXT.redeeming}</Muted>
      </CardBody>
    </Card>
  );
}
