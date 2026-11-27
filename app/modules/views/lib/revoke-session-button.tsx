import type { PublicId } from "../../sdk/index.ts";
import { QuietButton } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

const TEXT = { revoke: "Revoke" } as const;

interface RevokeSessionButtonProps {
  readonly session: PublicId;
  readonly onRevoke: (session: PublicId) => void;
}

export function RevokeSessionButton(props: RevokeSessionButtonProps): ReactNode {
  const { onRevoke, session } = props;
  const handleClick = useCallback(() => {
    onRevoke(session);
  }, [onRevoke, session]);
  return <QuietButton onClick={handleClick}>{TEXT.revoke}</QuietButton>;
}
