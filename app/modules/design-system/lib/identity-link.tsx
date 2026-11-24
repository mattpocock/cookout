import { Author } from "./author.tsx";
import type { IdentityLinkParts } from "./parts.ts";
import type { ReactNode } from "react";
import { presenceNameOf } from "./presence-name.ts";

function currentOf(active: boolean): "page" | false {
  if (active) {
    return "page";
  }
  return false;
}

export function IdentityLink(parts: IdentityLinkParts): ReactNode {
  const { displayName, name } = parts;
  return (
    <a
      aria-current={currentOf(parts.active)}
      aria-label={presenceNameOf({ name: displayName ?? name, presence: parts.presence })}
      className="flex min-h-[30px] min-w-0 flex-1 items-center rounded-lg px-1.5 py-[3px] hover:bg-hover focus-visible:ring-1 focus-visible:ring-link focus-visible:outline-none focus-visible:ring-inset aria-[current=page]:bg-accent"
      href={parts.href}
    >
      {displayName === null && (
        <Author agent={parts.agent} handle={null} presence={parts.presence} name={name} shown={name} size="medium" />
      )}
      {displayName !== null && (
        <Author
          agent={parts.agent}
          handle={`@${name}`}
          presence={parts.presence}
          name={name}
          shown={displayName}
          size="medium"
        />
      )}
    </a>
  );
}
