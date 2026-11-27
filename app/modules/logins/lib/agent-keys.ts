import type { IsoTime } from "../../time/index.ts";
import type { PublicId } from "./public-ids.ts";
import type { Token } from "../../identities/index.ts";

export const agentKeysPath = "/v1/identities/:name/agent-keys";

export const agentKeyPath = "/v1/identities/:name/agent-keys/:id";

export interface AgentKeyView {
  readonly id: PublicId;
  readonly name: string;
  readonly madeAt: IsoTime;
  readonly lastUsedAt?: IsoTime;
  readonly expiresAt?: IsoTime;
}

export interface CreateAgentKeyResponse {
  readonly agentKey: AgentKeyView;
  readonly token: Token;
}

export interface ListAgentKeysResponse {
  readonly agentKeys: readonly AgentKeyView[];
}

export interface RevokeAgentKeyResponse {
  readonly ended: number;
}
