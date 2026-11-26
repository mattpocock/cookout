import { useContext, useMemo } from "react";
import type { MenuChoice } from "../../design-system/messages.tsx";
import { MessageKeys } from "../../design-system/messages.tsx";
import { MoreActions } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";

const TEXT = { label: "Post later", schedule: "Schedule…" } as const;

interface ScheduleChoiceProps {
  readonly onSchedule: () => void;
}

export function ScheduleChoice(props: ScheduleChoiceProps): ReactNode {
  const { onSchedule } = props;
  const { schedule } = useContext(MessageKeys);
  const choices = useMemo(
    (): readonly MenuChoice[] => [
      { href: null, icon: "schedule", keys: schedule, label: TEXT.schedule, onSelect: onSchedule },
    ],
    [onSchedule, schedule],
  );
  return <MoreActions choices={choices} label={TEXT.label} look="box" />;
}
