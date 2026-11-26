import type { MessageItemParts } from "./message-parts.ts";

const MARKS: Readonly<Record<MessageItemParts["mark"], string>> = {
  "for-you": "bg-mention-bg shadow-[inset_2px_0_0_var(--color-mention-bar)]",
  linked: "bg-accent motion-safe:animate-linked-fade",
  none: "hover:bg-hover focus-within:bg-hover",
  open: "bg-accent",
};

function spacingOf(parts: Pick<MessageItemParts, "grouped" | "spaced">): string {
  if (parts.grouped) {
    return "py-0.5";
  }
  if (parts.spaced) {
    return "pt-4 pb-2.5";
  }
  return "pt-2.5 pb-1";
}

function messageClass(parts: Pick<MessageItemParts, "grouped" | "mark" | "spaced">): string {
  return `group relative flex gap-3 px-5 outline-none focus-visible:ring-2 focus-visible:ring-link/50 focus-visible:ring-inset ${spacingOf(parts)} ${MARKS[parts.mark]}`;
}

export { messageClass };
