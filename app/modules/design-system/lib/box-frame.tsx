import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

const FORM = [
  "[&_form]:relative [&_form]:flex-row [&_form]:items-end [&_form]:gap-0 [&_form]:rounded-[20px] [&_form]:border",
  "[&_form]:bg-surface [&_form]:p-1 [&_form]:transition-colors [&_form>button]:mr-1 [&_form>button]:mb-1",
  "[&_form:focus-within]:border-muted-foreground/40 [&_form:hover]:border-muted-foreground/40",
  "[&_form>div]:min-w-0 [&_form>div]:flex-1 [&_form_label]:sr-only [&_textarea]:max-h-[124px] [&_textarea]:overflow-y-auto [&_textarea]:min-h-9",
  "[&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:py-[7px]",
  "[&_textarea]:text-sm [&_textarea]:leading-[22px] [&_textarea]:field-sizing-content",
  "[&_textarea::placeholder]:text-muted-foreground [&_ul]:absolute [&_ul]:bottom-full [&_ul]:left-0 [&_ul]:mb-2",
  "[&_ul]:min-w-56 [&_ul]:shadow-lg",
].join(" ");

export function BoxFrame(parts: Parts): ReactNode {
  return <div className={`shrink-0 px-3 pt-1 pb-3 ${FORM}`}>{parts.children}</div>;
}
