import { Provider, Root, Trigger } from "@radix-ui/react-tooltip";
import type { IdentityCardParts } from "./identity-card-parts.ts";
import { IdentityCardPortal } from "./identity-card-portal.tsx";
import type { ReactNode } from "react";
import { useIdentityCard } from "./use-identity-card.ts";

const DELAY_MS = 500;

interface IdentityCardRootParts {
  readonly name: string;
  readonly card: IdentityCardParts | null;
  readonly children: ReactNode;
}

export function IdentityCardRoot(parts: IdentityCardRootParts): ReactNode {
  const { card } = parts;
  const state = useIdentityCard({ card, name: parts.name });
  const handleBlur = state.onTriggerBlur;
  const handleKeyDown = state.onTriggerKeyDown;
  const handleOpenChange = state.onOpenChange;
  return (
    <Provider delayDuration={DELAY_MS}>
      <Root onOpenChange={handleOpenChange} open={state.open}>
        <Trigger asChild data-identity-card={state.mark} onBlur={handleBlur} onKeyDown={handleKeyDown}>
          {parts.children}
        </Trigger>
        {card !== null && <IdentityCardPortal card={card} control={state.control} />}
      </Root>
    </Provider>
  );
}
