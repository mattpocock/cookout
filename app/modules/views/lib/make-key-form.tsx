import { InputField, LineForm } from "../../design-system/controls.tsx";
import type { AgentKeys } from "../../composer/index.ts";
import { Alert } from "../../design-system/content.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { makingAlert } from "./key-words.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  expiry: "Expires in",
  expiryHelp: "A count and a unit (s, m, h or d), such as 30d. Leave it empty for a key that never expires.",
  field: "Key name",
  submit: "Make key",
} as const;

interface MakeKeyFormProps {
  readonly keys: AgentKeys;
  readonly name: IdentityName;
}

export function MakeKeyForm(props: MakeKeyFormProps): ReactNode {
  const { keys } = props;
  const state = useSyncExternalStore(keys.subscribe, keys.snapshot);
  const handleEditName = keys.editName;
  const handleEditExpiry = keys.editExpiry;
  const handleMake = keys.make;
  const failed = makingAlert(state);
  return (
    <LineForm
      field={TEXT.field}
      label={`Make a key for @${props.name}`}
      onEdit={handleEditName}
      onSubmit={handleMake}
      saving={state.making.status === "sending"}
      submit={TEXT.submit}
      submitLast
      value={state.keyName}
    >
      <InputField
        error={null}
        help={TEXT.expiryHelp}
        kind="text"
        label={TEXT.expiry}
        onEdit={handleEditExpiry}
        required={false}
        value={state.expiresIn}
      />
      {failed !== null && <Alert>{failed}</Alert>}
    </LineForm>
  );
}
