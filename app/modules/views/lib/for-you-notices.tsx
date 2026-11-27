import type { AgentJoinRequests, DeactivatedQuietAgents, DeactivationOffers, Nudges } from "../../unread/index.ts";
import type { DeactivatedQuietAgent, DeactivationOffer, InboxAgentJoinRequest, Nudge } from "../../sdk/index.ts";
import { AgentJoinRequestRow } from "./agent-join-request-row.tsx";
import type { Identities } from "../../composer/index.ts";
import { OpenOffers } from "./open-offers.tsx";
import type { ReactNode } from "react";
import { UnreadDeactivatedQuietAgents } from "./unread-deactivated-quiet-agents.tsx";
import { UnreadNudgeRow } from "./unread-nudge-row.tsx";

interface NoticeActions {
  readonly nudges: Pick<Nudges, "close" | "markRead">;
  readonly deactivationOffers: Pick<DeactivationOffers, "keep">;
  readonly deactivatedQuietAgents: Pick<DeactivatedQuietAgents, "markRead">;
  readonly identities: Pick<Identities, "actions">;
  readonly agentJoinRequests: AgentJoinRequests;
}

interface ForYouNoticesProps {
  readonly nudges: readonly Nudge[];
  readonly offers: readonly DeactivationOffer[];
  readonly deactivated: readonly DeactivatedQuietAgent[];
  readonly joinRequests: readonly InboxAgentJoinRequest[];
  readonly actions: NoticeActions;
}

export function ForYouNotices(props: ForYouNoticesProps): ReactNode {
  const { actions } = props;
  return (
    <>
      {props.joinRequests.map((request) => (
        <AgentJoinRequestRow
          key={`join request ${request.userCode}`}
          request={request}
          requests={actions.agentJoinRequests}
        />
      ))}
      <UnreadDeactivatedQuietAgents
        deactivated={props.deactivated}
        entries={actions.deactivatedQuietAgents}
        identities={actions.identities}
      />
      <OpenOffers
        deactivationOffers={actions.deactivationOffers}
        identities={actions.identities}
        offers={props.offers}
      />
      {props.nudges.map((nudge) => (
        <UnreadNudgeRow key={`nudge ${String(nudge.id)}`} nudge={nudge} nudges={actions.nudges} />
      ))}
    </>
  );
}

export type { NoticeActions };
