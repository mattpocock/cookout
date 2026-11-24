import { Alert, FormDialog, InputField } from "../../design-system/index.tsx";
import type { DisplayNameDraft } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useNameDraft } from "./use-name-draft.ts";
import { useSavedName } from "./use-saved-name.ts";
import { useSyncExternalStore } from "react";

const TEXT = { busy: "Saving…", field: "Display name", save: "Save", title: "Edit display name" } as const;

interface AgentNameDialogProps {
  readonly draft: DisplayNameDraft;
  readonly name: IdentityName;
}

export function AgentNameDialog(props: AgentNameDialogProps): ReactNode {
  const { draft } = props;
  const saved = useSavedName(props.name);
  const shown = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const name = useNameDraft({ draft, saved });
  const handleCancel = draft.close;
  return (
    <FormDialog
      busy={name.saving}
      busyButton={TEXT.busy}
      button={TEXT.save}
      description={`How @${props.name} shows on its messages. Leave it empty to show @${props.name}.`}
      label={`Display name of @${props.name}`}
      onCancel={handleCancel}
      onSubmit={name.handleSave}
      open={shown.open}
      title={TEXT.title}
    >
      <InputField
        error={null}
        help={null}
        kind="text"
        label={TEXT.field}
        onEdit={name.handleEdit}
        required={false}
        value={name.value}
      />
      {name.failure !== null && <Alert>{name.failure}</Alert>}
    </FormDialog>
  );
}
