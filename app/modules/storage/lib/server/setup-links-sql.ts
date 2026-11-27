import { Effect, Option } from "effect";
import type { NewSetupLink, RedeemSetupLink, SetupLinkRedemption, SetupLinksSection } from "./setup-links.ts";
import { SETUP_LINK_GONE, SETUP_LINK_NAME_TAKEN } from "./setup-links.ts";
import { TRUE, isFalse } from "./adapters/sql-database.ts";
import { counted, insertIdentity } from "./identity-row.ts";
import type { Fails } from "./errors.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { credentialIn } from "./login-credential-lookup-sqlite.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { loginCredentialExpiry } from "./login-requests.ts";
import { newPublicId } from "./credential-lineage.ts";

const NONE = 0;

const ROOT = Option.getOrUndefined(Option.none<RedeemSetupLink["credentialHash"]>());

const LIVE_LINKS = "SELECT count(*) AS count FROM setup_links WHERE link_hash = ? AND expires_at > ?";

const TAKEN_NAMES = "SELECT count(*) AS count FROM identities WHERE name = ?";

const ISSUE_SESSION = `INSERT INTO login_credentials (hash, identity_name, host, created_at, last_used_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)`;

function activeAdmins(db: SqlDatabase): string {
  return `SELECT count(*) AS count FROM identities
    WHERE admin = ${TRUE[db.dialect]} AND ${isFalse[db.dialect]("deactivated")}`;
}

function linkReplaced(db: SqlDatabase, { createdAt, expiresAt, linkHash }: NewSetupLink): Fails<void> {
  return Effect.andThen(
    db.run("DELETE FROM setup_links"),
    db.run(
      "INSERT INTO setup_links (link_hash, created_at, expires_at) VALUES (?, ?, ?)",
      linkHash,
      createdAt,
      expiresAt,
    ),
  );
}

function adminMade(db: SqlDatabase, redeem: RedeemSetupLink, publicId: PublicId): Fails<SetupLinkRedemption> {
  const { admin, credentialHash, host, now } = redeem;
  return Effect.gen(function* makeFirstAdmin() {
    yield* insertIdentity(db)(admin, ROOT);
    yield* db.run("DELETE FROM setup_links");
    yield* db.run(ISSUE_SESSION, credentialHash, admin.name, host, now, now, loginCredentialExpiry(now));
    yield* lineageIn(db).record({
      hash: credentialHash,
      identity: admin.name,
      kind: "web",
      madeAt: now,
      parent: ROOT,
      publicId,
      where: host,
    });
    const made = yield* credentialIn(db)(credentialHash);
    return Option.match(made, {
      onNone: () => SETUP_LINK_GONE,
      onSome: (identity): SetupLinkRedemption => ({ identity, session: publicId, status: "redeemed" }),
    });
  });
}

function redeemed(db: SqlDatabase, redeem: RedeemSetupLink, publicId: PublicId): Fails<SetupLinkRedemption> {
  return Effect.gen(function* redeemSetupLink() {
    const live = yield* counted(db, LIVE_LINKS, redeem.linkHash, redeem.now);
    const admins = yield* counted(db, activeAdmins(db));
    if (live === NONE || admins !== NONE) {
      return SETUP_LINK_GONE;
    }
    const taken = yield* counted(db, TAKEN_NAMES, redeem.admin.name);
    if (taken !== NONE) {
      return SETUP_LINK_NAME_TAKEN;
    }
    return yield* adminMade(db, redeem, publicId);
  });
}

function sqlSetupLinks(db: SqlDatabase): SetupLinksSection {
  return {
    redeemSetupLink: (redeem) =>
      Effect.flatMap(newPublicId, (publicId) => db.transaction(redeemed(db, redeem, publicId))),
    replaceSetupLink: (link) => db.transaction(linkReplaced(db, link)),
  };
}

export { sqlSetupLinks };
