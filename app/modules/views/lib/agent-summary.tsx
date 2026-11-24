import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { SessionLine } from "./session-line.tsx";
import { SettingIdentity } from "../../design-system/index.tsx";
import { noteOf } from "./use-author.ts";

const NONE = 0;

interface AgentSummaryProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
}

function detailOf(identity: Identity): string | null {
  const parts: string[] = [];
  if ((identity.displayName ?? null) !== null) {
    parts.push(`@${identity.name}`);
  }
  const note = noteOf(identity);
  if (note !== null) {
    parts.push(note);
  }
  if (parts.length === NONE) {
    return null;
  }
  return parts.join(" · ");
}

export function AgentSummary(props: AgentSummaryProps): ReactNode {
  const { identity } = props;
  return (
    <SettingIdentity
      agent
      description={detailOf(identity)}
      name={identity.name}
      title={identity.displayName ?? identity.name}
    >
      <SessionLine actions={props.actions} />
    </SettingIdentity>
  );
}
