import { Card, CardBody, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { Session } from "../../board/index.ts";
import { SetupLinkEnded } from "./setup-link-ended.tsx";
import { SetupLinkForm } from "./setup-link-form.tsx";
import { useSetupLink } from "./use-setup-link.ts";

const TEXT = {
  description: "Name the cookout's first admin: you. You'll be logged in as them on this browser.",
  title: "Set up your cookout",
} as const;

interface SetupLinkViewProps {
  readonly session: Session;
  readonly secret: string;
}

export function SetupLinkView(props: SetupLinkViewProps): ReactNode {
  const state = useSetupLink(props.session);
  if (state.outcome.status === "gone") {
    return <SetupLinkEnded />;
  }
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.title}</Heading>
        <Muted>{TEXT.description}</Muted>
      </CardHeader>
      <CardBody>
        <SetupLinkForm secret={props.secret} setupLink={props.session.setupLink} state={state} />
      </CardBody>
    </Card>
  );
}
