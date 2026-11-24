import type { MouseEvent, ReactNode } from "react";
import { PresenceDot } from "./presence-dot.tsx";
import type { SuggestionOptionParts } from "./avatar-parts.ts";
import { optionIdOf } from "./option-id.ts";
import { presenceNameOf } from "./presence-name.ts";
import { useCallback } from "react";

interface OptionParts extends SuggestionOptionParts {
  readonly highlighted: boolean;
  readonly list: string;
  readonly index: number;
  readonly onChoose: (option: string) => void;
}

function optionStyle(highlighted: boolean): string {
  if (highlighted) {
    return "bg-muted";
  }
  return "";
}

export function SuggestionOption(parts: OptionParts): ReactNode {
  const { onChoose, option, presence } = parts;
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      onChoose(option);
    },
    [onChoose, option],
  );
  return (
    <div
      aria-label={presenceNameOf({ name: parts.spoken, presence })}
      aria-selected={parts.highlighted}
      className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-muted ${optionStyle(parts.highlighted)}`}
      id={optionIdOf({ index: parts.index, list: parts.list })}
      onMouseDown={handleMouseDown}
      role="option"
      tabIndex={-1}
    >
      {presence !== null && (
        <PresenceDot
          label={presence.label}
          name={option}
          online={presence.online}
          place="inline"
          spoken={presence.spoken}
          unreachable={presence.unreachable}
          warning={presence.warning}
        />
      )}
      <span>{option}</span>
      {parts.detail !== null && <span className="truncate text-xs text-muted-foreground">{parts.detail}</span>}
    </div>
  );
}
