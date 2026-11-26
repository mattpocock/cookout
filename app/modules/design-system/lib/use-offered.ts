import { useContext, useEffect, useRef } from "react";
import type { MenuChoice } from "./menu-parts.ts";
import { MessageActions } from "./message-actions.ts";
import type { RefObject } from "react";

interface Offering {
  readonly choices: readonly MenuChoice[];
  readonly inForm: boolean;
}

function targetOf(element: unknown, inForm: boolean): unknown {
  if (inForm && element instanceof HTMLElement) {
    return element.closest("form");
  }
  return element;
}

function useOffered<Shown extends HTMLElement>({ choices, inForm }: Offering): RefObject<Shown | null> {
  const element = useRef<Shown>(null);
  const { offer, withdraw } = useContext(MessageActions);
  useEffect(() => {
    const target = targetOf(element.current, inForm);
    offer(target, choices);
    return (): void => {
      withdraw(target);
    };
  }, [choices, inForm, offer, withdraw]);
  return element;
}

export { useOffered };
