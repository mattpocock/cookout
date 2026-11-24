import type { ReactNode } from "react";
import { SwitchTrack } from "./switch-track.tsx";
import type { SwitchTrackParts } from "./switch-track.tsx";

type SwitchFieldParts = SwitchTrackParts;

export function SwitchField(parts: SwitchFieldParts): ReactNode {
  const handleToggle = parts.onToggle;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground">
      <SwitchTrack checked={parts.checked} label={parts.label} onToggle={handleToggle} />
      {parts.label}
    </label>
  );
}
