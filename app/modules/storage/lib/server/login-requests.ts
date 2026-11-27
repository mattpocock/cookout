import { DateTime, Predicate } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { RequestOrigin } from "./request-origins.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { loginCredentialIdleSeconds } from "../../../logins/index.ts";

interface NewLoginRequest extends RequestOrigin {
  readonly requestHash: TokenHash;
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface LoginRequest extends RequestOrigin {
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly approved: boolean;
}

interface CollectLoginRequest {
  readonly requestHash: TokenHash;
  readonly credentialHash: TokenHash;
  readonly now: IsoTime;
}

interface IssueLoginCredential {
  readonly credentialHash: TokenHash;
  readonly identity: IdentityName;
  readonly host: string;
  readonly now: IsoTime;
  readonly parent: TokenHash | undefined;
}

interface ApproveLoginRequest {
  readonly userCode: string;
  readonly approver: IdentityName;
  readonly now: IsoTime;
  readonly approvedWith?: TokenHash | undefined;
}

interface UseLoginCredential {
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

type LoginCredentialLookup =
  | {
      readonly status: "active";
      readonly identity: Identity;
      readonly lastUsedAt: IsoTime;
      readonly expiresAt: IsoTime;
    }
  | { readonly status: "expired" }
  | { readonly status: "unknown" };

interface MadeSession {
  readonly id: PublicId;
  readonly where: string;
  readonly clientIp?: string;
}

interface IssuedLoginCredential {
  readonly identity: Identity;
  readonly session: PublicId;
}

type LoginCollection =
  | { readonly status: "pending" }
  | { readonly status: "collected"; readonly identity: Identity; readonly session: MadeSession }
  | { readonly status: "gone" };

interface LoginRequestsSection {
  readonly addLoginRequest: (request: NewLoginRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findLoginRequest: (userCode: string, now: IsoTime) => Fails<LoginRequest | undefined>;
  readonly approveLoginRequest: (approve: ApproveLoginRequest) => Fails<"approved" | "not_found">;
  readonly collectLoginRequest: (collect: CollectLoginRequest) => Fails<LoginCollection>;
  readonly issueLoginCredential: (issue: IssueLoginCredential) => Fails<IssuedLoginCredential | undefined>;
  readonly findLoginCredential: (hash: TokenHash) => Fails<Identity | undefined>;
  readonly useLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly checkLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly revokeLoginCredential: (hash: TokenHash, now: IsoTime) => Fails<boolean>;
}

const EXPIRED: LoginCredentialLookup = { status: "expired" };
const UNKNOWN: LoginCredentialLookup = { status: "unknown" };

function loginCredentialExpiry(lastUsedAt: IsoTime): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(lastUsedAt), { seconds: loginCredentialIdleSeconds }));
}

const PENDING: LoginCollection = { status: "pending" };
const GONE: LoginCollection = { status: "gone" };

interface Collected {
  readonly identity: Identity;
  readonly id: PublicId;
  readonly request: RequestOrigin & { readonly host: string };
}

function collected({ id, identity, request }: Collected): LoginCollection {
  const { clientIp, host } = request;
  if (Predicate.isUndefined(clientIp)) {
    return { identity, session: { id, where: host }, status: "collected" };
  }
  return { identity, session: { clientIp, id, where: host }, status: "collected" };
}

export {
  type ApproveLoginRequest,
  type CollectLoginRequest,
  EXPIRED,
  GONE,
  type LoginCredentialLookup,
  UNKNOWN,
  type UseLoginCredential,
  loginCredentialExpiry,
  type IssueLoginCredential,
  type IssuedLoginCredential,
  type LoginCollection,
  type LoginRequest,
  type LoginRequestsSection,
  type NewLoginRequest,
  PENDING,
  collected,
};
export { originColumns, originOf } from "./request-origins.ts";
