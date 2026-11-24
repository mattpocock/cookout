import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { optionIdOf } from "./option-id.ts";

interface ResultOptionParts {
  readonly list: string;
  readonly index: number;
  readonly highlighted: boolean;
  readonly label: string;
  readonly detail: string | null;
  readonly href: string;
  readonly onChoose: (href: string) => void;
  readonly children?: ReactNode;
}

const NEAREST = { block: "nearest" } as const;

function optionStyle(highlighted: boolean): string {
  if (highlighted) {
    return "bg-muted";
  }
  return "";
}

export function ResultOption(parts: ResultOptionParts): ReactNode {
  const { highlighted, href, onChoose } = parts;
  const option = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted && option.current !== null) {
      option.current.scrollIntoView(NEAREST);
    }
  }, [highlighted]);
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      onChoose(href);
    },
    [href, onChoose],
  );
  return (
    <div
      aria-selected={highlighted}
      className={`flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted ${optionStyle(highlighted)}`}
      id={optionIdOf({ index: parts.index, list: parts.list })}
      onMouseDown={handleMouseDown}
      ref={option}
      role="option"
      tabIndex={-1}
    >
      <span className="flex items-baseline gap-2">
        <span className="truncate text-foreground">{parts.label}</span>
        {parts.detail !== null && <span className="truncate text-xs text-muted-foreground">{parts.detail}</span>}
      </span>
      {parts.children}
    </div>
  );
}
