import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface PageSectionHeadingParts {
  readonly target: string;
  readonly label: string;
  readonly href: string;
  readonly focused: boolean;
}

export function PageSectionHeading(parts: PageSectionHeadingParts): ReactNode {
  const { focused } = parts;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = heading.current;
    if (focused && element !== null) {
      element.focus();
    }
  }, [focused]);
  return (
    <h2 className="text-[15px] font-semibold outline-none" id={parts.target} ref={heading} tabIndex={-1}>
      <a className="hover:underline" href={parts.href}>
        {parts.label}
      </a>
    </h2>
  );
}
