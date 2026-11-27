import type {
  LoginCollectedResponse,
  LoginRequestResponse,
  LoginRequestStartedResponse,
  LogoutResponse,
} from "../../../logins/index.ts";
import { hostMaximumLength, userCodePattern } from "../../../logins/index.ts";
import { IdentitySchema } from "./wire.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
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

export {
  approvalRequestDetailsFields,
  CollectLoginRequestSchema,
  LoginCollectedResponseSchema,
  LoginRequestResponseSchema,
  LoginRequestStartedResponseSchema,
  LogoutResponseSchema,
  StartLoginRequestSchema,
};
