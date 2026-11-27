/** Setup links on the wire: the route that redeems one into the first admin, its request, and the SDK's call (ADR 0161). */
import type { IdentityResponse, Token } from "../identities/index.ts";

/** How long a setup link lasts before it is gone, used or not: 24 hours (#913, ADR 0161). */
export const setupLinkSeconds = 86_400;

/**
 * `POST /v1/setup-links/redeem` (no token): redeems the setup link's secret with the first admin's `name` and optional
 * `displayName`, creating that person as an admin, setting the session cookie and answering them (#913). A used,
 * expired, replaced or unknown link, or any link once an admin exists, is 404 `setup_link_not_found`; a name already
 * taken is 409 `identity_exists`, and the link still works.
 */
export const redeemSetupLinkPath = "/v1/setup-links/redeem";

/** The web UI's path a setup link opens, before its secret: `<board>/#/setup-link/<secret>`. */
export const setupLinkWebPath = "/#/setup-link/";

/** The refusal code for a setup link that was used, expired, replaced or never made, or sent once an admin exists. */
export const setupLinkNotFound = "setup_link_not_found";

/** What redeeming a setup link sends: its secret, and the first admin's name and optional display name. */
export interface RedeemSetupLinkRequest {
  readonly secret: Token;
  readonly name: string;
  readonly displayName?: string;
}

/** The SDK's call for setting up a cookout's first admin. */
export interface SetupLinkCalls {
  /**
   * `POST /v1/setup-links/redeem` (no token): redeems the setup link `cookout serve` printed into the first admin,
   * named as sent, with a web session set as the session cookie (#913). A used, expired, replaced or unknown link, or
   * one sent once an admin exists, is 404 `setup_link_not_found`; a taken name is 409 `identity_exists`.
   */
  readonly redeemSetupLink: (request: RedeemSetupLinkRequest) => Promise<IdentityResponse>;
}
