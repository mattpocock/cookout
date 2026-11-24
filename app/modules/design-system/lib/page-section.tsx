import { PageSectionHeading } from "./page-section-heading.tsx";
import type { ReactNode } from "react";
import type { SectionAdd } from "./section-add.ts";
import { SectionAddButton } from "./section-add-button.tsx";
import { useId } from "react";

interface PageSectionParts {
  readonly label: string;
  readonly href: string;
  readonly focused: boolean;
  readonly add: SectionAdd | null;
  readonly children: ReactNode;
}

export function PageSection(parts: PageSectionParts): ReactNode {
  const id = useId();
  const { add } = parts;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <div className="flex min-h-7 items-center justify-between gap-4">
        <PageSectionHeading focused={parts.focused} href={parts.href} label={parts.label} target={id} />
        {add !== null && <SectionAddButton add={add} />}
      </div>
      <div className="flex flex-col divide-y *:py-4">{parts.children}</div>
    </section>
  );
}
