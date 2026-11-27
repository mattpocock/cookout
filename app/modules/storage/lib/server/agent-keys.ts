import type { EndedCredential, RevokeSessionResult } from "./credential-lineage.ts";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { Option } from "effect";
import type { PublicId } from "../../../logins/index.ts";

const LEGACY_KEY_NAME = "legacy";

interface NewAgentKey {
  readonly hash: TokenHash;
  readonly publicId: PublicId;
  readonly identity: IdentityName;
  readonly name: string;
  readonly parent: TokenHash | undefined;
  readonly now: IsoTime;
  readonly expiresAt: Option.Option<IsoTime>;
}

type CreateAgentKeyResult = "created" | "name_taken";

interface ListedAgentKey {
  readonly id: PublicId;
  readonly name: string;
  readonly madeAt: IsoTime;
  readonly lastUsedAt?: IsoTime;
  readonly expiresAt?: IsoTime;
}

interface RevokeAgentKey {
  readonly identity: IdentityName;
  readonly id: PublicId;
  readonly now: IsoTime;
}

interface UseAgentKey {
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

type UseAgentKeyResult = "used" | "expired" | "not an agent key";

interface AgentKeysSection {
  readonly createAgentKey: (key: NewAgentKey) => Fails<CreateAgentKeyResult>;
  readonly listAgentKeys: (identity: IdentityName) => Fails<readonly ListedAgentKey[]>;
  readonly revokeAgentKey: (revoke: RevokeAgentKey) => Fails<RevokeSessionResult>;
  readonly useAgentKey: (use: UseAgentKey) => Fails<UseAgentKeyResult>;
}

interface ListedFields {
  readonly id: PublicId;
  readonly name: string;
  readonly madeAt: IsoTime;
  readonly lastUsedAt: Option.Option<IsoTime>;
  readonly expiresAt: Option.Option<IsoTime>;
}

function isPastExpiry(now: IsoTime): (expiresAt: Option.Option<IsoTime>) => boolean {
  return (expiresAt) => Option.exists(expiresAt, (at) => now >= at);
}

function endedKey(ended: Omit<EndedCredential, "kind">): EndedCredential {
  return { ...ended, kind: "agent key" };
}

function listedKey({ expiresAt, id, lastUsedAt, madeAt, name }: ListedFields): ListedAgentKey {
  const made = { id, madeAt, name };
  const used = Option.match(lastUsedAt, { onNone: () => made, onSome: (at) => ({ ...made, lastUsedAt: at }) });
  return Option.match(expiresAt, { onNone: () => used, onSome: (at) => ({ ...used, expiresAt: at }) });
}

export {
  type AgentKeysSection,
  type CreateAgentKeyResult,
  LEGACY_KEY_NAME,
  type ListedAgentKey,
  type NewAgentKey,
  type RevokeAgentKey,
  type UseAgentKey,
  type UseAgentKeyResult,
  endedKey,
  isPastExpiry,
  listedKey,
};
