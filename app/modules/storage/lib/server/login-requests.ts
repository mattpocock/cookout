import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { DateTime } from "effect";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { loginCredentialIdleSeconds } from "../../../logins/index.ts";

interface NewLoginRequest {
  readonly requestHash: TokenHash;
  readonly userCode: string;
  readonly host: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface LoginRequest {
  readonly userCode: string;
  readonly host: string;
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
  readonly madeWith: TokenHash;
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

type LoginCollection =
  | { readonly status: "pending" }
  | { readonly status: "collected"; readonly identity: Identity }
  | { readonly status: "gone" };

interface LoginRequestsSection {
  readonly addLoginRequest: (request: NewLoginRequest, now: IsoTime) => Fails<"added" | "code_taken">;
  readonly findLoginRequest: (userCode: string, now: IsoTime) => Fails<LoginRequest | undefined>;
  readonly approveLoginRequest: (
    userCode: string,
    approver: IdentityName,
    now: IsoTime,
  ) => Fails<"approved" | "not_found">;
  readonly collectLoginRequest: (collect: CollectLoginRequest) => Fails<LoginCollection>;
  readonly issueLoginCredential: (issue: IssueLoginCredential) => Fails<Identity | undefined>;
  readonly findLoginCredential: (hash: TokenHash) => Fails<Identity | undefined>;
  readonly useLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly checkLoginCredential: (use: UseLoginCredential) => Fails<LoginCredentialLookup>;
  readonly revokeLoginCredential: (hash: TokenHash) => Fails<boolean>;
  readonly revokeLoginCredentialsMadeWithRevokedTokens: (identity: IdentityName) => Fails<readonly TokenHash[]>;
}

const EXPIRED: LoginCredentialLookup = { status: "expired" };
const UNKNOWN: LoginCredentialLookup = { status: "unknown" };

function loginCredentialExpiry(lastUsedAt: IsoTime): IsoTime {
  return isoTimeOf(DateTime.add(DateTime.makeUnsafe(lastUsedAt), { seconds: loginCredentialIdleSeconds }));
}

const PENDING: LoginCollection = { status: "pending" };
const GONE: LoginCollection = { status: "gone" };

function collected(identity: Identity): LoginCollection {
  return { identity, status: "collected" };
}

export {
  type CollectLoginRequest,
  EXPIRED,
  GONE,
  type LoginCredentialLookup,
  UNKNOWN,
  type UseLoginCredential,
  loginCredentialExpiry,
  type IssueLoginCredential,
  type LoginCollection,
  type LoginRequest,
  type LoginRequestsSection,
  type NewLoginRequest,
  PENDING,
  collected,
};
