import type { ReactNode } from "react";
import { SuggestionOption } from "./suggestion-option.tsx";
import type { SuggestionsParts } from "./avatar-parts.ts";

export function Suggestions(parts: SuggestionsParts): ReactNode {
  const handleChoose = parts.onChoose;
  return (
    <div
      aria-label={parts.label}
      className="z-50 flex flex-col gap-0.5 rounded-lg border bg-background p-1 text-sm"
      id={parts.list}
      role="listbox"
    >
      {parts.options.map((each, index) => (
        <SuggestionOption
          detail={each.detail}
          highlighted={index === parts.highlighted}
          index={index}
          key={each.option}
          list={parts.list}
          onChoose={handleChoose}
          option={each.option}
          presence={each.presence}
          spoken={each.spoken}
        />
      ))}
    </div>
  );
}
