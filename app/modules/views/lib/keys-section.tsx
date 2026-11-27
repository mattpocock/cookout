import { Alert, ProfileSection } from "../../design-system/content.tsx";
import type { Identities } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { KeyConfirm } from "./key-confirm.tsx";
import { KeyRow } from "./key-row.tsx";
import { KeyShown } from "./key-shown.tsx";
import { MakeKeyForm } from "./make-key-form.tsx";
import type { ReactNode } from "react";
import { listingAlert } from "./key-words.ts";
import { useSyncExternalStore } from "react";

const TEXT = { section: "Keys" } as const;

interface KeysSectionProps {
  readonly identities: Identities;
  readonly name: IdentityName;
  readonly makes: boolean;
}

export function KeysSection(props: KeysSectionProps): ReactNode {
  const keys = props.identities.keys(props.name);
  const state = useSyncExternalStore(keys.subscribe, keys.snapshot);
  const failed = listingAlert(state);
  return (
    <ProfileSection label={TEXT.section}>
      {(state.keys ?? []).map((key) => (
        <KeyRow agentKey={key} focused={state.forgotten === key.name} key={key.id} keys={keys} />
      ))}
      {failed !== null && <Alert>{failed}</Alert>}
      <KeyShown keys={keys} />
      {props.makes && <MakeKeyForm keys={keys} name={props.name} />}
      <KeyConfirm keys={keys} />
    </ProfileSection>
  );
}
