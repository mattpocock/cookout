import { Alert, Muted, ProfileSection } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { SessionCard } from "./session-card.tsx";
import type { SessionList } from "../../board/index.ts";
import { SessionsConfirm } from "./sessions-confirm.tsx";
import { alertOf } from "./sessions-words.ts";
import { useSyncExternalStore } from "react";

const NONE = 0;

const TEXT = { none: "No live sessions.", section: "Sessions" } as const;

interface ProfilePersonSessionsProps {
  readonly sessionList: SessionList;
}

export function ProfilePersonSessions(props: ProfilePersonSessionsProps): ReactNode {
  const { sessionList } = props;
  const state = useSyncExternalStore(sessionList.subscribe, sessionList.snapshot);
  const failed = alertOf(state);
  const { sessions } = state;
  const handleLogOut = sessionList.cancel;
  return (
    <ProfileSection label={TEXT.section}>
      {sessions !== null && sessions.length === NONE && <Muted>{TEXT.none}</Muted>}
      {(sessions ?? []).map((session) => (
        <SessionCard key={session.id} onLogOut={handleLogOut} session={session} sessionList={sessionList} />
      ))}
      {failed !== null && <Alert>{failed}</Alert>}
      <SessionsConfirm sessionList={sessionList} />
    </ProfileSection>
  );
}
