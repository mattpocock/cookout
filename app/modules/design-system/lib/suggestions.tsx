import type { ReactNode } from "react";
import { SuggestionOption } from "./suggestion-option.tsx";
import type { SuggestionsParts } from "./parts.ts";

export function Suggestions(parts: SuggestionsParts): ReactNode {
  const handleChoose = parts.onChoose;
  return (
    <ul aria-label={parts.label} className="z-50 flex flex-col gap-0.5 rounded-lg border bg-background p-1 text-sm">
      {parts.options.map((each, index) => (
        <SuggestionOption
          detail={each.detail}
          highlighted={index === parts.highlighted}
          key={each.option}
          onChoose={handleChoose}
          option={each.option}
          presence={each.presence}
          spoken={each.spoken}
        />
      ))}
    </ul>
  );
}
