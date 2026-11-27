import { AddressLimit, now, webSessionWhere } from "./login-support.ts";
import type { IdentityChanges, Secrets, SessionMade } from "./auth.ts";
import {
  RedeemSetupLinkRequestSchema,
  firstAdminOf,
  sentSecret,
  setupLinkGone,
  setupNameTaken,
} from "./setup-links.ts";
import { hashOf, issueToken, sessionMade } from "./auth.ts";
import { Effect } from "effect";
import { HttpServerRequest } from "effect/http";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import { clientAddress } from "../../../http/server.ts";
import { openLoginLinkRoutes } from "./login-link-redeem.ts";
import { redeemSetupLinkPath } from "../../../logins/index.ts";
import { signedInRoute } from "./session.ts";

const admitted = Effect.gen(function* admitAddress() {
  const limit = yield* AddressLimit;
  const address = yield* clientAddress;
  yield* limit.admit(address);
});

const sentBody = Effect.andThen(admitted, HttpServerRequest.schemaBodyJson(RedeemSetupLinkRequestSchema));

const redemptionSent = Effect.gen(function* readRedemption() {
  const body = yield* sentBody;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const linkHash = yield* hashOf(sentSecret(body));
  const issued = yield* issueToken;
  const at = yield* now;
  const host = webSessionWhere(request.headers["user-agent"]);
  return {
    issued,
    redeem: { admin: firstAdminOf({ body, createdAt: at }), credentialHash: issued.hash, host, linkHash, now: at },
  };
});

type SetupSession = Pick<SessionMade, "identity" | "session" | "where">;

function announcedSetupSession(
  made: SetupSession,
): Effect.Effect<void, never, HttpServerRequest.HttpServerRequest | IdentityChanges> {
  return Effect.flatMap(clientAddress, (clientIp) => sessionMade({ ...made, clientIp, sessionKind: "web" }));
}

const redeemed = Effect.gen(function* redeemSetupLink() {
  const { issued, redeem } = yield* redemptionSent;
  const storage = yield* Storage;
  const redemption = yield* storage.redeemSetupLink(redeem);
  if (redemption.status === "gone") {
    return yield* Effect.fail(setupLinkGone);
  }
  if (redemption.status === "name_taken") {
    return yield* Effect.fail(setupNameTaken(redeem.admin.name));
  }
  const { identity, session } = redemption;
  yield* announcedSetupSession({ identity: identity.name, session, where: redeem.host });
  return { identity, token: issued.token };
});

type LinkNeeds = Storage | Secrets | AddressLimit | IdentityChanges;

const redeemRoute: Route<LinkNeeds> = signedInRoute({ method: "POST", path: redeemSetupLinkPath, signIn: redeemed });

const openLinkRoutes: readonly Route<LinkNeeds>[] = [...openLoginLinkRoutes, redeemRoute];

export { openLinkRoutes };
export { setupLinkFor } from "./setup-links.ts";
