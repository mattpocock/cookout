import type { PersonKeysShared, PersonKeysSource } from "./person-keys-parts.ts";
import { useMemo, useState } from "react";
import { PersonKeys } from "./person-keys-parts.ts";
import type { ReactNode } from "react";

interface PersonKeysAreaParts {
  readonly keys: PersonKeysSource;
  readonly children: ReactNode;
}

export function PersonKeysArea(parts: PersonKeysAreaParts): ReactNode {
  const { keys } = parts;
  const [said, setSaid] = useState("");
  const shared = useMemo((): PersonKeysShared => ({ ...keys, announce: setSaid }), [keys]);
  return (
    <PersonKeys value={shared}>
      {parts.children}
      {said !== "" && <output className="sr-only">{said}</output>}
    </PersonKeys>
  );
}
