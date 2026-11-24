import { Badge } from "../../design-system/index.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { handledCommands } from "../../identities/client.ts";

const TEXT = { admin: "admin", agent: "agent", handlerFor: "Handler for /" } as const;

interface IdentityTagsProps {
  readonly identity: Identity;
}

export function IdentityTags(props: IdentityTagsProps): ReactNode {
  const { identity } = props;
  return (
    <>
      {identity.kind === "agent" && (
        <Badge size="sm" tone="muted" variant="outline">
          {TEXT.agent}
        </Badge>
      )}
      {identity.admin && (
        <Badge size="sm" tone="muted" variant="outline">
          {TEXT.admin}
        </Badge>
      )}
      {handledCommands(identity).map((command) => (
        <Badge key={command} size="sm" tone="muted" variant="outline">
          {`${TEXT.handlerFor}${command}`}
        </Badge>
      ))}
    </>
  );
}
