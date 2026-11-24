import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";
import type { ReactionChoice } from "./menu-parts.ts";

interface ReactButtonParts {
  readonly choice: ReactionChoice;
}

export function ReactButton(parts: ReactButtonParts): ReactNode {
  const { choice } = parts;
  const handleReact = choice.onReact;
  return (
    <button
      aria-label={`React with ${choice.symbol}`}
      className={`${PANEL_ACTION_LOOK} text-sm before:content-[attr(data-symbol)]`}
      data-symbol={choice.symbol}
      onClick={handleReact}
      title={`React with ${choice.symbol}`}
      type="button"
    />
  );
}
