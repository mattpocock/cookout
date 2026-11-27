import { Alert, Heading, Muted, QuietLink } from "../../design-system/content.tsx";
import { Card, CardBody, CardHeader } from "../../design-system/layout.tsx";
import type { LoginLinkState } from "../../board/index.ts";
import type { ReactNode } from "react";

const TEXT = {
  gone: "This login link has expired or was already used",
  help: "A login link works once, for 15 minutes. Ask an admin for a new one, or log in another way.",
  logIn: "Log in",
  refused: "This login link didn't log you in",
} as const;

interface LoginLinkEndedProps {
  readonly state: LoginLinkState;
}

function refusalOf(state: LoginLinkState): string | null {
  if (state.status !== "refused") {
    return null;
  }
  return `Couldn't log in (${state.refusal.code}): ${state.refusal.message}`;
}

function titleOf(refusal: string | null): string {
  if (refusal === null) {
    return TEXT.gone;
  }
  return TEXT.refused;
}

export function LoginLinkEnded(props: LoginLinkEndedProps): ReactNode {
  const refusal = refusalOf(props.state);
  return (
    <Card>
      <CardHeader>
        <Heading>{titleOf(refusal)}</Heading>
        <Muted>{TEXT.help}</Muted>
      </CardHeader>
      <CardBody>
        {refusal !== null && <Alert>{refusal}</Alert>}
        <QuietLink href="#/login">{TEXT.logIn}</QuietLink>
      </CardBody>
    </Card>
  );
}
