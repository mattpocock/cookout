import type {
  CreateAgentKeyResponse,
  ListAgentKeysResponse,
  ListSessionsResponse,
  LoginCollectedResponse,
  LoginRequestResponse,
  LoginRequestStartedResponse,
  LogoutResponse,
  RevokeAgentKeyResponse,
  RevokeSessionResponse,
} from "../../../logins/index.ts";
import { agentKeyNamePattern, hostMaximumLength, isPublicId, userCodePattern } from "../../../logins/index.ts";
import { IdentitySchema } from "./wire.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import { idleExpiryPattern } from "../../../agent-sessions/index.ts";
import { isToken } from "../../index.ts";
import { matchesWire } from "../../../http/index.ts";

const MINIMUM_HOST = 1;

const UserCodeSchema = Schema.String.check(Schema.isPattern(userCodePattern));

const TokenSchema = Schema.String.pipe(Schema.refine(isToken, { identifier: "Token" }));

const StartLoginRequestSchema = Schema.Struct({
  host: Schema.String.check(
    Schema.isTrimmed({ message: "Use no space at either end." }),
    Schema.isBetweenLength(MINIMUM_HOST, hostMaximumLength, { message: "Use 1-100 characters." }),
  ),
});

const CollectLoginRequestSchema = Schema.Struct({ requestId: Schema.String });

const LoginRequestStartedResponseSchema = matchesWire<LoginRequestStartedResponse>()(
  Schema.Struct({
    approvalPath: Schema.String,
    expiresAt: IsoTimeSchema,
    requestId: TokenSchema,
    userCode: UserCodeSchema,
  }),
);

const PendingSchema = Schema.Struct({ status: Schema.Literal("pending") });

const ApprovedSchema = Schema.Struct({
  identity: IdentitySchema,
  status: Schema.Literal("approved"),
  token: TokenSchema,
});

const LoginCollectedResponseSchema = matchesWire<LoginCollectedResponse>()(
  Schema.Union([PendingSchema, ApprovedSchema]),
);

const approvalRequestDetailsFields = {
  clientIp: Schema.optionalKey(Schema.String),
  createdAt: IsoTimeSchema,
  kind: Schema.Literals(["browser", "terminal", "agent_join"]),
  where: Schema.String,
};

const LoginRequestViewSchema = Schema.Struct({
  ...approvalRequestDetailsFields,
  approved: Schema.Boolean,
  expiresAt: IsoTimeSchema,
  host: Schema.String,
  userCode: UserCodeSchema,
});

const LoginRequestResponseSchema = matchesWire<LoginRequestResponse>()(
  Schema.Struct({ loginRequest: LoginRequestViewSchema }),
);

const LogoutResponseSchema = matchesWire<LogoutResponse>()(Schema.Struct({ revoked: Schema.Boolean }));

const SessionKindSchema = Schema.Literals(["web", "cli"]);

const PublicIdSchema = Schema.String.pipe(Schema.refine(isPublicId, { identifier: "PublicId" }));

const MadeBySchema = Schema.Struct({
  kind: Schema.Literals(["web", "cli", "identity token"]),
  where: Schema.optionalKey(Schema.String),
});

const SessionViewSchema = Schema.Struct({
  current: Schema.Boolean,
  expiresAt: IsoTimeSchema,
  id: PublicIdSchema,
  kind: SessionKindSchema,
  lastUsedAt: IsoTimeSchema,
  madeAt: IsoTimeSchema,
  madeBy: Schema.optionalKey(MadeBySchema),
  where: Schema.String,
});

const ListSessionsResponseSchema = matchesWire<ListSessionsResponse>()(
  Schema.Struct({ sessions: Schema.Array(SessionViewSchema) }),
);

const RevokeSessionResponseSchema = matchesWire<RevokeSessionResponse>()(Schema.Struct({ ended: Schema.Int }));

const CreateAgentKeyRequestSchema = Schema.Struct({
  expiresIn: Schema.optionalKey(Schema.String),
  name: Schema.String,
});

const AgentKeyViewSchema = Schema.Struct({
  expiresAt: Schema.optionalKey(IsoTimeSchema),
  id: PublicIdSchema,
  lastUsedAt: Schema.optionalKey(IsoTimeSchema),
  madeAt: IsoTimeSchema,
  name: Schema.String,
});

const CreateAgentKeyResponseSchema = matchesWire<CreateAgentKeyResponse>()(
  Schema.Struct({ agentKey: AgentKeyViewSchema, token: TokenSchema }),
);

const ListAgentKeysResponseSchema = matchesWire<ListAgentKeysResponse>()(
  Schema.Struct({ agentKeys: Schema.Array(AgentKeyViewSchema) }),
);

const RevokeAgentKeyResponseSchema = matchesWire<RevokeAgentKeyResponse>()(Schema.Struct({ ended: Schema.Int }));

function isAgentKeyName(name: string): boolean {
  return agentKeyNamePattern.test(name);
}

function isExpiresIn(expiresIn: string): boolean {
  return idleExpiryPattern.test(expiresIn);
}

export {
  approvalRequestDetailsFields,
  CreateAgentKeyRequestSchema,
  CreateAgentKeyResponseSchema,
  isAgentKeyName,
  isExpiresIn,
  ListAgentKeysResponseSchema,
  RevokeAgentKeyResponseSchema,
  CollectLoginRequestSchema,
  ListSessionsResponseSchema,
  RevokeSessionResponseSchema,
  LoginCollectedResponseSchema,
  LoginRequestResponseSchema,
  LoginRequestStartedResponseSchema,
  LogoutResponseSchema,
  StartLoginRequestSchema,
};
