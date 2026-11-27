/**
 * A Feeder: an agent that only posts into the board, such as GitHub notifications, and never reads or answers
 * mentions (Matt, 2026-11-27, board thread 8268, ADR 0158). Its route, the check for one, and the refusal it gets when
 * it would watch, read its inbox or join.
 */
import type { Identity, IdentityName } from "./index.ts";
import type { Refusal } from "../http/index.ts";

const FORBIDDEN = 403;

/**
 * `PUT /v1/identities/:name/feeder` (the agent's owner, or an admin) makes an agent a Feeder; `DELETE` makes it an
 * agent that reads its mentions again. Both answer `IdentityResponse`. A human is refused with 403 `identity_kind`,
 * anyone else with 403 `not_owner`.
 */
export const identityFeederPath = "/v1/identities/:name/feeder";

/**
 * Whether `identity` is a Feeder.
 *
 * @param identity The identity.
 * @returns `true` for an agent made a feeder.
 */
export function isFeeder(identity: Readonly<Identity>): boolean {
  return identity.kind === "agent" && identity.feeder === true;
}

/**
 * The refusal a Feeder gets when it would watch, read its inbox or join, as it only posts.
 *
 * @param name The feeder's name.
 * @returns 403 `identity_kind`.
 */
export function feederRefused(name: IdentityName): Refusal {
  return {
    code: "identity_kind",
    message: `${name} is a feeder: it only posts, so it can't watch, read an inbox or join.`,
    status: FORBIDDEN,
  };
}
