import { Clock, Context, Effect, FileSystem, Layer, Option, Path } from "effect";
import { WebhookFake, webhookFake } from "../../../webhook-fake/server.ts";
import { adminWithoutToken, loginLinkFor } from "../../../identities/server.ts";
import { cuttableRelay, serverUrl } from "../../../http/server.ts";
import { diskAssetStore, sqliteStorage } from "../../../storage/server.ts";
import { newSecretsKey, secretsCipher, secretsLive } from "../../../secrets/server.ts";
import type { Scope } from "effect";
import type { Serving } from "../../../http/server.ts";
import { adjustableClock } from "./adjustable-clock.ts";
import { cookoutServer } from "../../../cli/server.ts";
import { firstAdminName } from "../../../identities/index.ts";
import { triggerCallerLive } from "../../../triggers/server.ts";

interface DevCookout {
  readonly clockUrl: string;
  readonly database: string;
  readonly loginLink: string;
  readonly relayUrl: string;
  readonly url: string;
  readonly webhookFakeUrl: string;
  readonly webUrl: string;
}

type Needs = FileSystem.FileSystem | Path.Path | Scope.Scope;

const LOCAL = "127.0.0.1";

function databaseInTempFolder(): Effect.Effect<string, never, Needs> {
  return Effect.gen(function* makeDatabasePath() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-dev-" }));
    return path.join(folder, "cookout.db");
  });
}

interface DevCookoutOptions {
  readonly port: number;
  readonly probe: boolean;
  readonly web: Option.Option<string>;
}

function webUrlFor(
  url: string,
  { probe, web }: DevCookoutOptions,
): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> {
  return Option.match(web, {
    onNone: () =>
      Effect.gen(function* startVite() {
        const { viteDevServer } = yield* Effect.promise(() => import("./web.ts"));
        return yield* viteDevServer({ cookoutUrl: url, probe });
      }),
    onSome: () => Effect.succeed(url),
  });
}

function servingOf({ port, web }: DevCookoutOptions): Serving {
  return Option.match(web, {
    onNone: () => ({ host: LOCAL, port }),
    onSome: (webFolder) => ({ host: LOCAL, port, webFolder }),
  });
}

const devSecretsCipher = Effect.flatMap(newSecretsKey, (key) => Effect.fromOption(secretsCipher(key))).pipe(
  Effect.orDie,
);

function devCookoutOn(options: DevCookoutOptions): Effect.Effect<Omit<DevCookout, "clockUrl">, never, Needs> {
  return Effect.gen(function* startDevCookout() {
    const database = yield* databaseInTempFolder();
    const live = yield* Layer.build(
      Layer.mergeAll(
        sqliteStorage({ cipher: yield* devSecretsCipher, path: database }),
        diskAssetStore(`${database}-assets`),
        secretsLive,
        triggerCallerLive,
      ),
    );
    yield* Effect.provideContext(adminWithoutToken(firstAdminName), live);
    const backing = Layer.succeedContext(live);
    const server = yield* Layer.build(cookoutServer(servingOf(options)).pipe(Layer.provide(backing)));
    const fake = yield* Layer.build(webhookFake);
    const url = yield* Effect.provideContext(serverUrl, server);
    const webUrl = yield* webUrlFor(url, options);
    const relay = yield* cuttableRelay(webUrl);
    return {
      database,
      loginLink: (yield* Effect.provideContext(loginLinkFor({ name: firstAdminName, origin: webUrl }), live)).link,
      relayUrl: relay.url,
      url,
      webUrl,
      webhookFakeUrl: Context.get(fake, WebhookFake).url,
    };
  }).pipe(Effect.orDie);
}

function devCookout(options: DevCookoutOptions): Effect.Effect<DevCookout, never, Needs> {
  return Effect.gen(function* startOnAdjustableClock() {
    const { clock, url } = yield* adjustableClock();
    const dev = yield* Effect.provideService(devCookoutOn(options), Clock.Clock, clock);
    return { ...dev, clockUrl: url };
  });
}

export { devCookout };
