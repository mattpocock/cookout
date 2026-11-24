import type { ButtonParts } from "./button-parts.ts";
import type { ReactNode } from "react";
import { Spinner } from "./spinner.tsx";

interface MoreButtonParts extends ButtonParts {
  readonly loading: boolean;
}

export function MoreButton(parts: MoreButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-busy={parts.loading}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
      disabled={parts.loading}
      onClick={onClick}
      type="button"
    >
      {parts.loading && <Spinner />}
      {parts.children}
    </button>
  );
}
