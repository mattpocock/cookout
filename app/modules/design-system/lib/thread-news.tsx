import type { ReactNode } from "react";
import { StatusDot } from "./status-dot.tsx";

interface ThreadNewsParts {
  readonly children: string;
  readonly forYou: boolean;
}

export function ThreadNews(parts: ThreadNewsParts): ReactNode {
  return (
    <>
      {parts.forYou && <StatusDot mode="for-you" />}
      <span className="font-semibold text-foreground">{parts.children}</span>
    </>
  );
}
