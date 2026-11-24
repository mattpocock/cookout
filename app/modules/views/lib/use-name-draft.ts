import { useCallback, useSyncExternalStore } from "react";
import type { DisplayNameDraft } from "../../composer/index.ts";

interface NameField {
  readonly draft: DisplayNameDraft;
  readonly saved: string | null;
}

interface NameDraft {
  readonly value: string;
  readonly saving: boolean;
  readonly failure: string | null;
  readonly handleEdit: (text: string) => void;
  readonly handleSave: () => void;
}

function useNameDraft(field: NameField): NameDraft {
  const { draft, saved } = field;
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const { save } = state;
  const value = state.text ?? saved ?? "";
  const handleSave = useCallback(() => {
    draft.save(value);
  }, [draft, value]);
  let failure: string | null = null;
  if (save.status === "failed") {
    failure = `Couldn't save the display name (${save.code}): ${save.message}`;
  }
  return { failure, handleEdit: draft.edit, handleSave, saving: save.status === "saving", value };
}

export { useNameDraft };
