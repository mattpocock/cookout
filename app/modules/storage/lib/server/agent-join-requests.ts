import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { IssueAgentSession, IssueAgentSessionResult } from "./agent-sessions.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { renewedExpiry } from "./agent-sessions.ts";

interface NewAgentJoinRequest {
  readonly requestHash: TokenHash;
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface AgentJoinRequest {
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

interface PendingAgentJoinRequest {
  readonly userCode: string;
  readonly agent: IdentityName;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface AgentJoinApproval {
  readonly identity: IdentityName;
  readonly created: boolean;
  readonly idleSeconds: number;
  readonly force: boolean;
}

interface CollectAgentJoinRequest {
  readonly requestHash: TokenHash;
  readonly sessionHash: TokenHash;
  readonly now: IsoTime;
}

type AgentJoinCollection =
  | { readonly status: "pending" }
  | { readonly status: "gone" }
  | { readonly status: "live"; readonly identity: IdentityName; readonly expiresAt: IsoTime }
  | {
      readonly status: "collected";
      readonly identity: IdentityName;
      readonly created: boolean;
      readonly issuedAt: IsoTime;
      readonly expiresAt: IsoTime;
    };

interface AgentJoinRequestsSection {
  readonly addAgentJoinRequest: (request: NewAgentJoinRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findAgentJoinRequest: (userCode: string, now: IsoTime) => Fails<AgentJoinRequest | undefined>;
  readonly listPendingAgentJoinRequests: (now: IsoTime) => Fails<readonly PendingAgentJoinRequest[]>;
  readonly approveAgentJoinRequest: (
    userCode: string,
    approval: AgentJoinApproval,
    now: IsoTime,
  ) => Fails<"approved" | "not_found">;
  readonly collectAgentJoinRequest: (collect: CollectAgentJoinRequest) => Fails<AgentJoinCollection>;
}

interface Approved {
  readonly approval: AgentJoinApproval;
  readonly host: string;
  readonly collect: CollectAgentJoinRequest;
}

interface Issued {
  readonly issue: IssueAgentSession;
  readonly created: boolean;
  readonly result: IssueAgentSessionResult;
}

const PENDING: AgentJoinCollection = { status: "pending" };
const GONE: AgentJoinCollection = { status: "gone" };

function sessionToIssue({ approval, collect, host }: Approved): IssueAgentSession {
  const { force, idleSeconds, identity } = approval;
  const { now, sessionHash } = collect;
  const expiresAt = renewedExpiry({ idleSeconds, now });
  return { force, session: { expiresAt, hash: sessionHash, host, identity, idleSeconds, issuedAt: now } };
}

function collectionOf({ created, issue, result }: Issued): AgentJoinCollection {
  const { expiresAt, identity, issuedAt } = issue.session;
  if (result.status === "live") {
    return { expiresAt: result.expiresAt, identity, status: "live" };
  }
  return { created, expiresAt, identity, issuedAt, status: "collected" };
}

export { GONE, PENDING, collectionOf, sessionToIssue };

export type { JoinCodesSection } from "./join-codes.ts";

export type {
  AgentJoinApproval,
  AgentJoinCollection,
  AgentJoinRequest,
  AgentJoinRequestsSection,
  CollectAgentJoinRequest,
  NewAgentJoinRequest,
  PendingAgentJoinRequest,
};
