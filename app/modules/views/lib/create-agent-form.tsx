import { Alert, FormDialog, InputField } from "../../design-system/index.tsx";
import type { AgentCreation } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = {
  busy: "Creating…",
  description: "It gets its own token to join the board, shown once after it is created.",
  field: "Name",
  label: "Create an agent",
  submit: "Create",
  title: "New agent",
} as const;

interface CreateAgentFormProps {
  readonly creation: AgentCreation;
}

export function CreateAgentForm(props: CreateAgentFormProps): ReactNode {
  const { creation } = props;
  const state = useSyncExternalStore(creation.subscribe, creation.snapshot);
  const handleEdit = creation.edit;
  const handleCreate = creation.create;
  const handleCancel = creation.close;
  const { create } = state;
  return (
    <FormDialog
      busy={create.status === "creating"}
      busyButton={TEXT.busy}
      button={TEXT.submit}
      description={TEXT.description}
      label={TEXT.label}
      onCancel={handleCancel}
      onSubmit={handleCreate}
      open={state.open}
      title={TEXT.title}
    >
      <InputField
        error={null}
        help={null}
        kind="text"
        label={TEXT.field}
        onEdit={handleEdit}
        required
        value={state.text}
      />
      {create.status === "failed" && <Alert>{`Couldn't create the agent (${create.code}): ${create.message}`}</Alert>}
    </FormDialog>
  );
}
