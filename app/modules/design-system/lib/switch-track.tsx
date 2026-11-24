import type { ReactNode } from "react";

interface SwitchTrackParts {
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}

const TRACK =
  "group/switch relative inline-flex h-4 w-[26px] shrink-0 items-center rounded-full bg-border transition-[background-color] duration-100 outline-none focus-visible:ring-1 focus-visible:ring-offset-2 aria-checked:bg-foreground";

const THUMB =
  "pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 aspect-square rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-out group-aria-checked/switch:translate-x-2.5";

export function SwitchTrack(parts: SwitchTrackParts): ReactNode {
  const { onToggle } = parts;
  return (
    <button
      aria-checked={parts.checked}
      aria-label={parts.label}
      className={TRACK}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className={THUMB} />
    </button>
  );
}

export type { SwitchTrackParts };
