import type { ChannelCreation, ChannelCreationSnapshot, CreationState } from "../../board/index.ts";
import { FormDialog, InputField } from "../../design-system/index.tsx";
import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";
import { useCallback } from "react";

const TEXT = {
  busy: "Creating…",
  button: "Create",
  description: "Description",
  descriptionHelp: "What the channel is for, up to 500 characters.",
  intro: "A place for one topic, open to everyone on the board.",
  name: "Name",
  nameHelp: "Lowercase letters, digits or '-', up to 80.",
  title: "New channel",
} as const;

interface NewChannelFormProps {
  readonly creation: ChannelCreation;
  readonly state: ChannelCreationSnapshot;
}

function errorOn(create: CreationState, field: "name" | "description"): string | null {
  if (create.status !== "failed" || create.field !== field) {
    return null;
  }
  return `Couldn't create the channel (${create.code}): ${create.message}`;
}

function openChannel(channel: ChannelName): void {
  globalThis.location.hash = hrefOf({ channel, name: "channel" });
}

export function NewChannelForm(props: NewChannelFormProps): ReactNode {
  const { creation, state } = props;
  const handleCancel = creation.close;
  const handleEditName = creation.editName;
  const handleEditDescription = creation.editDescription;
  const handleSubmit = useCallback(() => {
    creation.create(openChannel);
  }, [creation]);
  return (
    <FormDialog
      busy={state.create.status === "creating"}
      busyButton={TEXT.busy}
      button={TEXT.button}
      description={TEXT.intro}
      disabled={false}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
      open={state.open}
      title={TEXT.title}
    >
      <InputField
        error={errorOn(state.create, "name")}
        help={TEXT.nameHelp}
        kind="text"
        label={TEXT.name}
        onEdit={handleEditName}
        required
        value={state.name}
      />
      <InputField
        error={errorOn(state.create, "description")}
        help={TEXT.descriptionHelp}
        kind="text"
        label={TEXT.description}
        onEdit={handleEditDescription}
        required={false}
        value={state.description}
      />
    </FormDialog>
  );
}
