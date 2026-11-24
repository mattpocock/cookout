import type { DisplayNameDraft, IdentityActions } from "../../composer/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { ListedAgentSession } from "../../sdk/index.ts";
import type { MenuChoice } from "../../design-system/index.tsx";
import { MoreActions } from "../../design-system/index.tsx";
import type { ReactNode } from "react";

const NONE = 0;
const NO_SESSIONS: readonly ListedAgentSession[] = [];

const TEXT = {
  deactivate: "Deactivate",
  edit: "Edit display name",
  more: "More actions",
  reactivate: "Reactivate",
  revoke: "Revoke session",
  rotate: "Rotate token",
} as const;

interface AgentMenuProps {
  readonly actions: IdentityActions;
  readonly active: boolean;
  readonly draft: DisplayNameDraft;
}

interface MenuState {
  readonly active: boolean;
  readonly live: boolean;
  readonly sending: boolean;
}

type Choose = (label: string, icon: MenuChoice["icon"], onSelect: () => void) => MenuChoice;

function choosing(disabled: boolean): Choose {
  return (label, icon, onSelect) => ({ disabled, href: null, icon, label, onSelect });
}

function choicesOf(props: AgentMenuProps, state: MenuState): readonly MenuChoice[] {
  const { ask } = props.actions;
  const choiceOf = choosing(state.sending);
  const edit = choosing(false)(TEXT.edit, "edit-name", props.draft.open);
  if (!state.active) {
    return [edit, choiceOf(TEXT.reactivate, "power", ask.reactivate)];
  }
  const rotate = choiceOf(TEXT.rotate, "rotate-token", ask.rotate);
  const deactivate = choiceOf(TEXT.deactivate, "power", ask.deactivate);
  if (!state.live) {
    return [edit, rotate, deactivate];
  }
  return [edit, rotate, choiceOf(TEXT.revoke, "revoke-session", ask.revoke), deactivate];
}

export function AgentMenu(props: AgentMenuProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const sending = state.action.status === "sending";
  const live = (state.sessions ?? NO_SESSIONS).length > NONE;
  const choices = useMemo(() => choicesOf(props, { active: props.active, live, sending }), [props, live, sending]);
  return <MoreActions choices={choices} label={TEXT.more} quiet />;
}
