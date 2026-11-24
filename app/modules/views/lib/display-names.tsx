import type { Composer } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { SettingNameField } from "./setting-name-field.tsx";
import { useSavedName } from "./use-saved-name.ts";

const TEXT = { description: "How your name shows on your messages.", field: "Your display name" } as const;

interface DisplayNamesProps {
  readonly composer: Composer;
  readonly me: IdentityName;
}

export function DisplayNames(props: DisplayNamesProps): ReactNode {
  const { composer, me } = props;
  const saved = useSavedName(me);
  return (
    <SettingNameField
      description={TEXT.description}
      draft={composer.displayName(me)}
      field={TEXT.field}
      label={TEXT.field}
      saved={saved ?? String(me)}
    />
  );
}
