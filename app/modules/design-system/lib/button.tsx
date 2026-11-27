import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";
import { useKeptFocus } from "./use-kept-focus.ts";

type ButtonTone = "solid" | "quiet" | "destructive";

const SHAPE =
  "self-start rounded-md border text-xs font-medium transition-opacity disabled:opacity-50 aria-disabled:opacity-50";

const LOOKS: Readonly<Record<ButtonTone, string>> = {
  destructive: `${SHAPE} border-transparent px-2 py-1 text-destructive hover:bg-destructive/10`,
  quiet: `${SHAPE} border-transparent px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground`,
  solid: `${SHAPE} bg-foreground px-3 py-1.5 text-background hover:opacity-90`,
};

interface TonedButtonParts extends ButtonParts {
  readonly tone?: ButtonTone;
}

export function Button(parts: TonedButtonParts): ReactNode {
  const { onClick, unavailable } = parts;
  const tone = parts.tone ?? "solid";
  const button = useFocusOnOpen<HTMLButtonElement>(parts.focused === true);
  const handleClick = useCallback(() => {
    if (unavailable !== true) {
      onClick();
    }
  }, [onClick, unavailable]);
  useKeptFocus(parts.disabled === true);
  return (
    <button
      className={LOOKS[tone]}
      aria-disabled={unavailable}
      data-tone={tone}
      disabled={parts.disabled}
      onClick={handleClick}
      ref={button}
      type="button"
    >
      {parts.children}
    </button>
  );
}
