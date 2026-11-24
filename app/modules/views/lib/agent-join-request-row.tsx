import { Alert, ButtonRow, FeedNoticeRow, RowButton } from "../../design-system/index.tsx";
import { useCallback, useSyncExternalStore } from "react";
import type { AgentJoinRequests } from "../../unread/index.ts";
import type { InboxAgentJoinRequest } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const TEXT = { approve: "Approve" } as const;

interface AgentJoinRequestRowProps {
  readonly request: InboxAgentJoinRequest;
  readonly requests: AgentJoinRequests;
}

function refusalText(requests: ReturnType<AgentJoinRequests["snapshot"]>, userCode: string): string | null {
  const refused = requests.refused.get(userCode) ?? null;
  if (refused === null) {
    return null;
  }
  return `Couldn't approve (${refused.code}): ${refused.message}`;
}

export function AgentJoinRequestRow(props: AgentJoinRequestRowProps): ReactNode {
  const { request, requests } = props;
  const state = useSyncExternalStore(requests.subscribe, requests.snapshot);
  const { agent, displayName, note, presence, profileHref } = useAuthor(request.agent);
  const time = useTimeAgo(request.createdAt);
  const handleApprove = useCallback(() => {
    requests.approve(request.userCode);
  }, [requests, request]);
  const refused = refusalText(state, request.userCode);
  return (
    <FeedNoticeRow
      agent={agent}
      displayName={displayName}
      href={profileHref}
      level="for-you"
      name={request.agent.name}
      note={note}
      presence={presence}
      time={time}
      why={request.text}
    >
      <ButtonRow>
        <RowButton onClick={handleApprove}>{TEXT.approve}</RowButton>
      </ButtonRow>
      {refused !== null && <Alert>{refused}</Alert>}
    </FeedNoticeRow>
  );
}
