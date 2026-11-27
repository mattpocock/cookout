import { Effect, Option, Predicate } from "effect";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import { LINK_GONE, linkRedeemed } from "./login-links.ts";
import type { LoginLinkRedemption, LoginLinksSection, NewLoginLink, RedeemLoginLink } from "./login-links.ts";
import type { EndedCredential } from "./credential-lineage.ts";
import type { Ender } from "./credential-lineage-memory.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { LoginRequestsSection } from "./login-requests.ts";
import type { MemoryState } from "./memory-state.ts";
import { newPublicId } from "./credential-lineage.ts";

interface MemoryLoginLinksOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
  readonly issueLoginCredential: LoginRequestsSection["issueLoginCredential"];
}

type Links = Map<TokenHash, NewLoginLink>;

interface MemoryLoginLinks extends LoginLinksSection {
  readonly dropLoginLinks: (name: IdentityName) => Effect.Effect<void>;
}

function enderOf(links: Links): Ender {
  return (hash, now) =>
    Option.flatMap(Option.fromUndefinedOr(links.get(hash)), (link) => {
      links.delete(hash);
      const ended: EndedCredential = { hash, identity: link.identity, kind: "login link" };
      return Option.as(
        Option.liftPredicate(link, () => now < link.expiresAt),
        ended,
      );
    });
}

function isPersonIn(findIdentity: FindIdentity, name: IdentityName): boolean {
  const found = findIdentity(name);
  return Predicate.isNotUndefined(found) && found.kind === "human" && found.deactivated !== true;
}

function redeemIn(options: MemoryLoginLinksOptions, links: Links) {
  return ({ credentialHash, host, linkHash, now }: RedeemLoginLink): Fails<LoginLinkRedemption> => {
    const link = links.get(linkHash);
    if (Predicate.isUndefined(link) || now >= link.expiresAt || !isPersonIn(options.findIdentity, link.identity)) {
      return Effect.succeed(LINK_GONE);
    }
    links.delete(linkHash);
    options.state.lineage.markEnded({ hash: linkHash, now, why: "redeemed" });
    const issue = { credentialHash, host, identity: link.identity, now, parent: linkHash };
    return Effect.map(options.issueLoginCredential(issue), (issued) => {
      if (Predicate.isUndefined(issued)) {
        return LINK_GONE;
      }
      return linkRedeemed(issued);
    });
  };
}

function memoryLoginLinks(options: MemoryLoginLinksOptions): MemoryLoginLinks {
  const { state } = options;
  const links: Links = new Map();
  state.lineage.addEnder(enderOf(links));
  const redeem = redeemIn(options, links);
  return {
    addLoginLink: (link) =>
      Effect.flatMap(newPublicId, (publicId) =>
        Effect.andThen(
          state.ensureOpen,
          Effect.sync(() => {
            links.set(link.linkHash, { ...link });
            const { createdAt, identity, linkHash, parent } = link;
            state.lineage.record({ hash: linkHash, identity, kind: "login link", madeAt: createdAt, parent, publicId });
          }),
        ),
      ),
    dropLoginLinks: (name) =>
      Effect.sync(() => {
        for (const [hash, link] of links) {
          if (link.identity === name) {
            links.delete(hash);
          }
        }
      }),
    redeemLoginLink: (given) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.suspend(() => redeem(given)),
      ),
  };
}

export { memoryLoginLinks };
