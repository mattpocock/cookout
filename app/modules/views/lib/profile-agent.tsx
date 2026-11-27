import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Identities } from "../../composer/index.ts";
import { KeysSection } from "./keys-section.tsx";
import { ProfileSession } from "./profile-session.tsx";
import type { ReactNode } from "react";
import { keysMadeBy } from "./profile-rights.ts";

interface ProfileAgentProps {
  readonly identities: Identities;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileAgent(props: ProfileAgentProps): ReactNode {
  const { identities, identity } = props;
  const active = identity.deactivated !== true;
  return (
    <>
      <ProfileSession actions={identities.actions(identity.name)} active={active} />
      {active && <KeysSection identities={identities} makes={keysMadeBy(props)} name={identity.name} />}
    </>
  );
}
