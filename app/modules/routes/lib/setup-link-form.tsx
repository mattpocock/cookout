import { InputField, LineForm } from "../../design-system/controls.tsx";
import type { Session, SetupLinkState } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

const TEXT = {
  displayName: "Your display name (optional)",
  displayNameHelp: "The name shown beside your @name, such as 'Grace Hopper'.",
  field: "Your name",
  label: "Set up the first admin",
  submit: "Create admin",
} as const;

interface SetupLinkFormProps {
  readonly secret: string;
  readonly setupLink: Session["setupLink"];
  readonly state: SetupLinkState;
}

function refusalLine({ outcome }: SetupLinkState): string | null {
  if (outcome.status !== "refused") {
    return null;
  }
  return `Couldn't set up the admin (${outcome.refusal.code}): ${outcome.refusal.message}`;
}

export function SetupLinkForm(props: SetupLinkFormProps): ReactNode {
  const { secret, setupLink, state } = props;
  const handleEdit = setupLink.editName;
  const handleEditDisplayName = setupLink.editDisplayName;
  const handleRedeem = useCallback(() => {
    setupLink.redeem(secret);
  }, [secret, setupLink]);
  const refusal = refusalLine(state);
  return (
    <LineForm
      field={TEXT.field}
      label={TEXT.label}
      onEdit={handleEdit}
      onSubmit={handleRedeem}
      saving={state.outcome.status === "redeeming"}
      submit={TEXT.submit}
      submitLast
      value={state.name}
    >
      <InputField
        error={null}
        help={TEXT.displayNameHelp}
        kind="text"
        label={TEXT.displayName}
        onEdit={handleEditDisplayName}
        required={false}
        value={state.displayName}
      />
      {refusal !== null && <Alert>{refusal}</Alert>}
    </LineForm>
  );
}
