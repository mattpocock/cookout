import { AgentCard } from "./agent-card.tsx";
import type { Composer } from "../../composer/index.ts";
import { CreateAgentForm } from "./create-agent-form.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import { Muted } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NONE = 0;
const TEXT = { empty: "No agents yet. New agent makes one, with its own token." } as const;

interface MyAgentsProps {
  readonly composer: Composer;
  readonly me: IdentityName;
}

export function MyAgents(props: MyAgentsProps): ReactNode {
  const { composer, me } = props;
  const { identities } = composer;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const owned = listed.filter((identity) => identity.kind === "agent" && identity.owner === String(me));
  return (
    <>
      <CreateAgentForm creation={identities.creation} />
      {owned.length === NONE && <Muted>{TEXT.empty}</Muted>}
      {owned.map((agent) => (
        <AgentCard draft={composer.displayName(agent.name)} identities={identities} identity={agent} key={agent.name} />
      ))}
    </>
  );
}
