import { Card, CardBody, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted, QuietLink } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const TEXT = {
  gone: "This setup link has expired or was already used",
  help: "A setup link works once, for 24 hours, while the cookout has no admin. Run cookout admin setup-link on the server for a new one, or log in if an admin exists.",
  logIn: "Log in",
} as const;

export function SetupLinkEnded(): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.gone}</Heading>
        <Muted>{TEXT.help}</Muted>
      </CardHeader>
      <CardBody>
        <QuietLink href="#/login">{TEXT.logIn}</QuietLink>
      </CardBody>
    </Card>
  );
}
