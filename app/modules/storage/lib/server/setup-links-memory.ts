import { Array as Arr, Effect, Option, Predicate, Ref } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { NewSetupLink, RedeemSetupLink, SetupLinkRedemption, SetupLinksSection } from "./setup-links.ts";
import { SETUP_LINK_GONE, SETUP_LINK_NAME_TAKEN } from "./setup-links.ts";
import type { Fails } from "./errors.ts";
import type { LoginRequestsSection } from "./login-requests.ts";
import type { MemoryState } from "./memory-state.ts";

interface MemorySetupLinksOptions {
  readonly state: MemoryState;
  readonly findIdentity: (name: IdentityName) => Identity | undefined;
  readonly listIdentities: () => Fails<readonly Identity[]>;
  readonly createIdentity: (identity: Identity) => Fails<unknown>;
  readonly issueLoginCredential: LoginRequestsSection["issueLoginCredential"];
}

const ROOT = Option.getOrUndefined(Option.none<TokenHash>());

function hasActiveAdmin(identities: readonly Identity[]): boolean {
  return Arr.some(identities, (identity) => identity.admin && identity.deactivated !== true);
}

function isLive(held: Option.Option<NewSetupLink>, { linkHash, now }: RedeemSetupLink): boolean {
  return Option.exists(held, (link) => link.linkHash === linkHash && now < link.expiresAt);
}

function memorySetupLinks(options: MemorySetupLinksOptions): SetupLinksSection {
  const held = Ref.makeUnsafe(Option.none<NewSetupLink>());
  function adminMade({ admin, credentialHash, host, now }: RedeemSetupLink): Fails<SetupLinkRedemption> {
    return Effect.gen(function* makeFirstAdmin() {
      yield* Ref.set(held, Option.none());
      yield* options.createIdentity(admin);
      const issue = { credentialHash, host, identity: admin.name, now, parent: ROOT };
      const made = yield* options.issueLoginCredential(issue);
      return Option.match(Option.fromUndefinedOr(made), {
        onNone: () => SETUP_LINK_GONE,
        onSome: ({ identity, session }): SetupLinkRedemption => ({ identity, session, status: "redeemed" }),
      });
    });
  }
  return {
    redeemSetupLink: (redeem) =>
      Effect.gen(function* redeemSetupLink() {
        const identities = yield* options.listIdentities();
        const link = yield* Ref.get(held);
        if (!isLive(link, redeem) || hasActiveAdmin(identities)) {
          return SETUP_LINK_GONE;
        }
        if (Predicate.isNotUndefined(options.findIdentity(redeem.admin.name))) {
          return SETUP_LINK_NAME_TAKEN;
        }
        return yield* adminMade(redeem);
      }),
    replaceSetupLink: (link) => Effect.andThen(options.state.ensureOpen, Ref.set(held, Option.some({ ...link }))),
  };
}

export { type MemorySetupLinksOptions, memorySetupLinks };
