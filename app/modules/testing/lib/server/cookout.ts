import type { AdminSetting, BootAs, StartAs } from "./first-admin.ts";
import {
  Array as Arr,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Record as Rec,
  Ref,
  Scope,
} from "effect";
import type { Booted, HeldAssets, LastEnd, LoggedLine } from "./booted.ts";
import type { CookoutClient, Identity, Message, Token } from "../../../sdk/index.ts";
import type { CredentialNeeds, IdentityFixtureOptions, SeededCredential } from "./identities.ts";
import type { NewMessage, StorageUnavailable, StoredDelivery, StoredWebhookCommand } from "../../../storage/server.ts";
import { adminLoggedInAgain, firstAdminLogIn, settingBoot, settingServing } from "./first-admin.ts";
import { agedStorageFor, backingServices, newToken, scriptedTriggersIn } from "./backing.ts";
import { booted, capturedLogs, heldAssetsOn, lastEndOn, liveConnectionsClosedOn, restartable } from "./booted.ts";
import { currentTime, startTestClock } from "./time.ts";
import { identityFixture, ownedByAdminUnlessNamed, seededIdentity, testCookoutAdminName } from "./identities.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageKind } from "./backing.ts";
import { WebhookFake } from "../../../webhook-fake/server.ts";
import { cookoutServer } from "../../../cli/server.ts";
import { createCookoutClient } from "../../../sdk/index.ts";

const FIRST_PARAMETER = 0;

type SeededLoginAlert = Parameters<Storage["Service"]["recordLoginAlert"]>[typeof FIRST_PARAMETER];

export type TestIdentity = {
  readonly identity: Identity;
  readonly token: Token;
  readonly client: CookoutClient;
};

export type CreateTestIdentityOptions = IdentityFixtureOptions & {
  readonly createdAt?: Identity["createdAt"];
  readonly credential?: SeededCredential;
};

export type BootedServer = {
  readonly url: string;
};

export type TestCookoutService = {
  readonly url: string;
  readonly adminSession: Token;
  readonly client: CookoutClient;
  readonly clientFor: (token?: string) => CookoutClient;
  readonly createIdentity: (name: string, options?: CreateTestIdentityOptions) => Effect.Effect<TestIdentity>;
  readonly startSecondServer: Effect.Effect<BootedServer>;
  readonly startSecondServerAs: StartAs;
  readonly restart: Effect.Effect<CookoutClient>;
  readonly adminLogsInAgain: Effect.Effect<CookoutClient>;
  readonly ageLogin: (credential: string, days: number) => Effect.Effect<void>;

  readonly liveConnectionsClosed: (name: string) => Effect.Effect<void>;
  readonly lastEnd: (name: string) => Effect.Effect<LastEnd>;
  readonly restartServer: Effect.Effect<BootedServer>;
  readonly restartServerAfter: (whileDown: Effect.Effect<void>) => Effect.Effect<BootedServer>;
  readonly seedMessage: (message: NewMessage) => Effect.Effect<Message>;
  readonly seedCommand: (stored: StoredWebhookCommand) => Effect.Effect<void>;
  readonly seedLoginAlert: (alert: SeededLoginAlert) => Effect.Effect<void>;
  readonly pendingDeliveries: Effect.Effect<readonly StoredDelivery[]>;
  readonly heldAssets: HeldAssets;
  readonly logs: Effect.Effect<readonly LoggedLine[]>;
  readonly webhook: WebhookFake["Service"];
  readonly triggers: ReturnType<typeof scriptedTriggersIn>;
};

export class TestCookout extends Context.Service<TestCookout, TestCookoutService>()(
  "@ai-hero/cookout/testing/lib/server/cookout/TestCookout",
) {}

export type TestCookoutOptions = {
  readonly storage?: StorageKind;
  readonly secrets?: "test" | "live";
  readonly assets?: "failing-removes" | "first-remove-fails";
  readonly maxIdleExpiry?: string;
  readonly publicUrl?: string;
  readonly webhookTimeoutSeconds?: number;
  readonly requestsPerMinute?: number;
  readonly noTokenRequestsPerMinute?: number;
  readonly flyAppName?: string;
  readonly commandCallsPerMinute?: number;
  readonly streamsPerIdentity?: number;
  readonly triggers?: "receiver" | "scripted";
  readonly allowLocalTriggers?: false;
};

type Setting =
  | "commandCallsPerMinute"
  | "maxIdleExpiry"
  | "noTokenRequestsPerMinute"
  | "requestsPerMinute"
  | "streamsPerIdentity"
  | "webhookTimeoutSeconds";

const settingNames: readonly (readonly [Setting, string])[] = [
  ["commandCallsPerMinute", "COOKOUT_COMMAND_CALLS_PER_MINUTE"],
  ["maxIdleExpiry", "COOKOUT_MAX_IDLE_EXPIRY"],
  ["noTokenRequestsPerMinute", "COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE"],
  ["requestsPerMinute", "COOKOUT_REQUESTS_PER_MINUTE"],
  ["streamsPerIdentity", "COOKOUT_STREAMS_PER_IDENTITY"],
  ["webhookTimeoutSeconds", "COOKOUT_WEBHOOK_TIMEOUT_SECONDS"],
];

function localTriggers({ allowLocalTriggers }: TestCookoutOptions): readonly (readonly [string, string])[] {
  if (allowLocalTriggers === false) {
    return [];
  }
  return [["COOKOUT_ALLOW_LOCAL_TRIGGERS", "true"]];
}

function serverEnv(options: TestCookoutOptions): ConfigProvider.ConfigProvider {
  const set = Arr.flatMap(settingNames, ([option, name]) => {
    const value = options[option];
    return value === undefined ? [] : [[name, String(value)] as const];
  });
  return ConfigProvider.fromEnv({
    env: Rec.fromEntries([...set, ...localTriggers(options)]),
  });
}

const clientAt =
  (url: string) =>
  (token: string | undefined): CookoutClient =>
    createCookoutClient({ env: {}, url, ...(token === undefined ? {} : { token }) });

function seedMissingOwner(identity: Identity): Effect.Effect<void, StorageUnavailable, CredentialNeeds> {
  return Effect.gen(function* seedOwner() {
    if (identity.kind === "human") {
      return;
    }
    const storage = yield* Storage;
    const found = yield* storage.findIdentityByName(identity.owner);
    if (Predicate.isNotUndefined(found)) {
      return;
    }
    const owner = identityFixture(identity.owner, { kind: "human" });
    yield* storage.createIdentity({ ...owner, createdAt: identity.createdAt });
  });
}

const seedIdentity =
  (url: string) =>
  (name: string, options: CreateTestIdentityOptions = {}): Effect.Effect<TestIdentity, never, CredentialNeeds> =>
    Effect.gen(function* seedTestIdentity() {
      const { createdAt: seededAt, credential = "session or agent key", ...kind } = options;
      const createdAt = seededAt ?? (yield* currentTime);
      const identity: Identity = { ...identityFixture(name, ownedByAdminUnlessNamed(kind)), createdAt };
      yield* seedMissingOwner(identity);
      const token = yield* seededIdentity({ credential, identity });
      return { client: clientAt(url)(token), identity, token };
    }).pipe(Effect.orDie);

function seedCommand(stored: StoredWebhookCommand): Effect.Effect<void, never, Storage> {
  const handler = {
    admin: false,
    createdAt: stored.command.createdAt,
    kind: "agent",
    name: stored.command.handler,
    owner: testCookoutAdminName,
  } as const;
  return Effect.gen(function* seedTestCommand() {
    const storage = yield* Storage;
    yield* storage.addWebhookCommand(stored, handler);
  }).pipe(Effect.orDie);
}

function seedLoginAlert(alert: SeededLoginAlert): Effect.Effect<void, never, Storage> {
  return Effect.asVoid(Effect.orDie(Effect.flatMap(Storage, (storage) => storage.recordLoginAlert(alert))));
}

function seedMessage(message: NewMessage): Effect.Effect<Message, never, Storage> {
  return Effect.flatMap(Storage, (storage) => storage.appendMessage(message)).pipe(
    Effect.filterOrFail((result) => result.status === "appended"),
    Effect.map((result) => result.message),
    Effect.orDie,
  );
}

const pendingDeliveries: Effect.Effect<readonly StoredDelivery[], never, Storage> = Effect.gen(
  function* listTestPendingDeliveries() {
    const storage = yield* Storage;
    return yield* storage.listPendingDeliveries;
  },
).pipe(Effect.orDie);

interface Boot {
  readonly logIn: (started: Booted) => Effect.Effect<Token>;
  readonly ageLogin: TestCookoutService["ageLogin"];
  readonly triggers: ReturnType<typeof scriptedTriggersIn>;
  readonly logs: Effect.Effect<readonly LoggedLine[]>;
  readonly boot: Effect.Effect<Booted, never, Scope.Scope>;
  readonly bootAs: BootAs;
}

function bootOn(options: TestCookoutOptions): Effect.Effect<Boot, never, Scope.Scope> {
  return Effect.gen(function* prepareBoot() {
    const services = yield* Layer.build(backingServices(options));
    const { ageLogin, storage } = yield* Effect.provideContext(agedStorageFor(options), services);
    const logs = yield* capturedLogs;
    const env = serverEnv(options);
    const bootWith = (setting: Option.Option<AdminSetting>) =>
      Effect.gen(function* bootServer() {
        const server = cookoutServer({
          behindFly: Predicate.isNotUndefined(options.flyAppName),
          host: "127.0.0.1",
          port: 0,
          publicUrl: options.publicUrl ?? "",
          ...settingServing(setting),
        });
        return yield* booted(
          server.pipe(
            Layer.provideMerge(storage),
            Layer.provideMerge(Layer.succeedContext(services)),
            Layer.provide(logs.layer),
          ),
        );
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, env),
        Effect.catchTags({
          ConfigError: Effect.die,
          SecretsKeyMismatch: Effect.die,
          ServeError: Effect.die,
          StorageUnavailable: Effect.die,
        }),
      );
    const boot = Effect.orDie(bootWith(Option.none()));
    const settingToken = yield* Effect.cached(newToken(services));
    const bootAs = settingBoot({ bootWith, settingToken });
    const logIn = firstAdminLogIn(services);
    return { ageLogin, boot, bootAs, logIn, logs: logs.lines, triggers: scriptedTriggersIn(services) };
  });
}

export const testCookout = (options: TestCookoutOptions = {}): Layer.Layer<TestCookout> =>
  Layer.effect(
    TestCookout,
    Effect.gen(function* startTestCookout() {
      yield* startTestClock;
      const scope = yield* Effect.scope;
      const { ageLogin: aged, boot, bootAs, logIn, logs, triggers } = yield* bootOn(options);
      const { first, restartServerAfter, running } = yield* restartable(boot);
      const adminSession = yield* logIn(first);
      const onFirst = Effect.provideContext(first.server);
      return TestCookout.of({
        adminLogsInAgain: adminLoggedInAgain(first),
        adminSession,
        ageLogin: aged,
        client: clientAt(first.url)(adminSession),
        clientFor: clientAt(first.url),
        createIdentity: (name, identityOptions = {}) => onFirst(seedIdentity(first.url)(name, identityOptions)),
        heldAssets: heldAssetsOn(first.server),
        lastEnd: (name) => Effect.flatMap(Ref.get(running), (server) => lastEndOn({ name, server })),
        liveConnectionsClosed: (name) =>
          Effect.flatMap(Ref.get(running), (server) => liveConnectionsClosedOn({ name, server })),
        logs,
        pendingDeliveries: onFirst(pendingDeliveries),
        restart: Effect.map(restartServerAfter(Effect.void), ({ url }) => clientAt(url)(adminSession)),
        restartServer: restartServerAfter(Effect.void),
        restartServerAfter,
        seedCommand: (stored) => onFirst(seedCommand(stored)),
        seedLoginAlert: (alert) => onFirst(seedLoginAlert(alert)),
        seedMessage: (message) => onFirst(seedMessage(message)),
        startSecondServer: Effect.map(Scope.provide(boot, scope), ({ url }) => ({ url })),
        startSecondServerAs: (adminName) => Scope.provide(bootAs(adminName), scope),
        triggers,
        url: first.url,
        webhook: Context.get(first.server, WebhookFake),
      });
    }).pipe(Effect.orDie),
  );
