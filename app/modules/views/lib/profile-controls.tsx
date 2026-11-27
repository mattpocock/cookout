import type { Identity, IdentityName } from "../../sdk/index.ts";
import { actionableBy, adminChangeableBy } from "./profile-rights.ts";
import type { Identities } from "../../composer/index.ts";
import { ProfileAgent } from "./profile-agent.tsx";
import { ProfileManage } from "./profile-manage.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface ProfileControlsProps {
  readonly identities: Identities;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileControls(props: ProfileControlsProps): ReactNode {
  const { identities, identity, me } = props;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const viewing = { identity, listed, me };
  const actionable = actionableBy(viewing);
  return (
    <>
      {actionable && identity.kind === "agent" && <ProfileAgent identities={identities} identity={identity} me={me} />}
      {(actionable || adminChangeableBy(viewing)) && (
        <ProfileManage actionable={actionable} identities={identities} identity={identity} me={me} />
      )}
    </>
  );
}
