import { FilterField, Pane, PaneHeader, SwitchField, Toolbar, ToolbarDivider } from "../../design-system/index.tsx";
import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { KindChoice, Layout } from "../../layout/index.ts";
import type { Identities } from "../../composer/index.ts";
import { KindChip } from "./kind-chip.tsx";
import { PeopleRows } from "./people-rows.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { deactivated: "Show deactivated", filter: "Filter by name", title: "People & agents" } as const;

const KINDS = [
  { kind: "all", label: "All" },
  { kind: "human", label: "Humans" },
  { kind: "agent", label: "Agents" },
] as const;

interface PeopleProps {
  readonly identities: Identities;
  readonly layout: Layout;
  readonly me: IdentityName;
  readonly open: IdentityName | null;
}

function ofKind(listed: readonly Identity[], kind: KindChoice): readonly Identity[] {
  return listed.filter((identity) => kind === "all" || identity.kind === kind);
}

function active(listed: readonly Identity[], showDeactivated: boolean): readonly Identity[] {
  return listed.filter((identity) => showDeactivated || identity.deactivated !== true);
}

function named(listed: readonly Identity[], filter: string): readonly Identity[] {
  const text = filter.trim().toLowerCase();
  return listed.filter((identity) =>
    [identity.name, identity.displayName ?? ""].some((each) => each.toLowerCase().includes(text)),
  );
}

export function PeopleView(props: PeopleProps): ReactNode {
  const { layout } = props;
  const everyone = useSyncExternalStore(props.identities.subscribe, props.identities.snapshot);
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const listed = active(everyone, state.showDeactivated);
  const matching = named(listed, state.identityFilter);
  const shown = ofKind(matching, state.identityKind);
  const handleEdit = layout.filterIdentities;
  const handleToggle = layout.toggleDeactivated;
  return (
    <Pane>
      <PaneHeader description={`${String(listed.length)} identities`} sans title={TEXT.title} />
      <Toolbar>
        <FilterField label={TEXT.filter} onEdit={handleEdit} value={state.identityFilter} />
        {KINDS.map((each) => (
          <KindChip
            count={ofKind(matching, each.kind).length}
            key={each.kind}
            kind={each.kind}
            label={each.label}
            layout={layout}
            pressed={state.identityKind === each.kind}
          />
        ))}
        <ToolbarDivider />
        <SwitchField checked={state.showDeactivated} label={TEXT.deactivated} onToggle={handleToggle} />
      </Toolbar>
      <PeopleRows listed={everyone} me={props.me} open={props.open} shown={shown} />
    </Pane>
  );
}
