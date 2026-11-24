import type { KindChoice, Layout } from "../../layout/index.ts";
import { Chip } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

interface KindChipProps {
  readonly kind: KindChoice;
  readonly label: string;
  readonly count: number;
  readonly layout: Layout;
  readonly pressed: boolean;
}

export function KindChip(props: KindChipProps): ReactNode {
  const { kind, layout } = props;
  const handleClick = useCallback(() => {
    layout.showKind(kind);
  }, [kind, layout]);
  return (
    <Chip onClick={handleClick} pressed={props.pressed}>
      {`${props.label} `}
      <span className="tabular-nums opacity-60">{props.count}</span>
    </Chip>
  );
}
