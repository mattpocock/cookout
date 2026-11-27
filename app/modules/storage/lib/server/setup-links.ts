import type { Identity, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PublicId } from "../../../logins/index.ts";

interface NewSetupLink {
  readonly linkHash: TokenHash;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface RedeemSetupLink {
  readonly linkHash: TokenHash;
  readonly admin: Identity;
  readonly credentialHash: TokenHash;
  readonly host: string;
  readonly now: IsoTime;
}

type SetupLinkRedemption =
  | { readonly status: "gone" }
  | { readonly status: "name_taken" }
  | { readonly status: "redeemed"; readonly identity: Identity; readonly session: PublicId };

interface SetupLinksSection {
  readonly replaceSetupLink: (link: NewSetupLink) => Fails<void>;
  readonly redeemSetupLink: (redeem: RedeemSetupLink) => Fails<SetupLinkRedemption>;
}

function setupLinkGone(): SetupLinkRedemption {
  return { status: "gone" };
}

const SETUP_LINK_NAME_TAKEN: SetupLinkRedemption = { status: "name_taken" };

const SETUP_LINKS_MIGRATION = `CREATE TABLE setup_links (
  link_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;`;

const POSTGRES_SETUP_LINKS_MIGRATION: readonly string[] = [
  `CREATE TABLE setup_links (
     link_hash text COLLATE "C" PRIMARY KEY,
     created_at text COLLATE "C" NOT NULL,
     expires_at text COLLATE "C" NOT NULL
   )`,
];

export {
  POSTGRES_SETUP_LINKS_MIGRATION,
  SETUP_LINKS_MIGRATION,
  SETUP_LINK_NAME_TAKEN,
  setupLinkGone,
  type NewSetupLink,
  type RedeemSetupLink,
  type SetupLinkRedemption,
  type SetupLinksSection,
};
