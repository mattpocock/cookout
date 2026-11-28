import { Context, Effect, Option } from "effect";
import type { IdentityName, Token } from "../../../identities/index.ts";
import { adminLoggedIn, identityName, loggedIn, testCookoutAdminName } from "./identities.ts";
import type { AdminNameIsAgent } from "../../../identities/server.ts";
import type { Booted } from "./booted.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import type { Secrets } from "../../../secrets/server.ts";
import { createCookoutClient } from "../../../sdk/index.ts";

interface SettingServer {
  readonly url: string;
  readonly settingToken: Token;
}

interface AdminSetting {
  readonly adminName: string;
  readonly settingToken: Token;
}

interface SettingServing {
  readonly adminName?: IdentityName;
  readonly adminToken?: Token;
}

type BootAs = (adminName: string) => Effect.Effect<SettingServer, AdminNameIsAgent, Scope.Scope>;

type StartAs = (adminName: string) => Effect.Effect<SettingServer, AdminNameIsAgent>;

type BootWith = (setting: Option.Option<AdminSetting>) => Effect.Effect<Booted, AdminNameIsAgent, Scope.Scope>;

function settingServing(setting: Option.Option<AdminSetting>): SettingServing {
  return Option.match(setting, {
    onNone: () => ({}),
    onSome: ({ adminName, settingToken }) => ({ adminName: identityName(adminName), adminToken: settingToken }),
  });
}

function settingBoot({
  bootWith,
  settingToken,
}: {
  readonly bootWith: BootWith;
  readonly settingToken: Effect.Effect<Token>;
}): BootAs {
  return (adminName) =>
    Effect.gen(function* bootWithSetting() {
      const token = yield* settingToken;
      const { url } = yield* bootWith(Option.some({ adminName, settingToken: token }));
      return { settingToken: token, url };
    });
}

function firstAdminLogIn(services: Context.Context<Secrets>): (started: Booted) => Effect.Effect<Token> {
  return ({ server }) =>
    Effect.orDie(Effect.provideContext(adminLoggedIn(testCookoutAdminName), Context.merge(services, server)));
}

function adminLoggedInAgain({ server, url }: Booted): Effect.Effect<CookoutClient> {
  return Effect.gen(function* logAdminInAgain() {
    const session = yield* Effect.orDie(Effect.provideContext(loggedIn(testCookoutAdminName), server));
    return createCookoutClient({ env: {}, token: session, url });
  });
}

export {
  type AdminSetting,
  type BootAs,
  type StartAs,
  type SettingServer,
  adminLoggedInAgain,
  firstAdminLogIn,
  settingBoot,
  settingServing,
};
