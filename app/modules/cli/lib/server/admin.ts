import { Argument, Command, Flag } from "effect/cli";
import type { Config, FileSystem, Scope } from "effect";
import { Effect, Layer, Option, Predicate, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import { consoleLoginLink, identityChangesLayer, setupLinkFor } from "../../../identities/server.ts";
import { databasePath, port, publicUrl } from "../../../config/server.ts";
import { printLine, refused } from "./output.ts";
import { secretsCipherOrRefuse, servedStorage } from "./serve-stores.ts";
import type { CommandFailed } from "./output.ts";
import type { IdentityChanges } from "../../../identities/server.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "../../../secrets/server.ts";
import { offlineAlertsLayer } from "../../../inbox/server.ts";
import { storageLayer } from "../../../storage/server.ts";

const adminExists = {
  code: "admin_exists",
  message:
    "This cookout already has an admin, so it takes no setup link. Run `cookout admin login-link <name>` to log a person in.",
};

function isRefusal(failure: object): failure is Refusal {
  return Predicate.hasProperty(failure, "status");
}

function refusedAs({ code, message }: Refusal): Effect.Effect<never, CommandFailed> {
  const failure = { code, message };
  return refused(failure);
}

const boardOrigin = Effect.gen(function* boardAddress() {
  const url = yield* publicUrl;
  const listening = yield* port;
  if (Str.isNonEmpty(url)) {
    return url;
  }
  return `http://localhost:${String(listening)}`;
});

type Failed = CommandFailed | Config.ConfigError;

type ConsoleWork = Effect.Effect<void, Failed | StorageUnavailable, Storage | Secrets | IdentityChanges>;

type Opened = Effect.Effect<void, Failed | StorageUnavailable, Secrets | FileSystem.FileSystem | Scope.Scope>;

function unavailable(
  redact: (text: string) => string,
): (failure: { readonly message: string }) => Effect.Effect<never, CommandFailed> {
  return ({ message }) => {
    const failure = { code: "storage_unavailable", message: redact(message) };
    return refused(failure);
  };
}

function onStore(
  db: string,
  work: Effect.Effect<void, Failed | StorageUnavailable, Storage | Secrets | IdentityChanges>,
): Effect.Effect<void, Failed, Secrets | FileSystem.FileSystem> {
  return Effect.gen(function* openStore() {
    const served = yield* servedStorage(db);
    const cipher = yield* secretsCipherOrRefuse;
    const alerts = Layer.provideMerge(offlineAlertsLayer, identityChangesLayer);
    const layer = Layer.provideMerge(alerts, storageLayer({ cipher, setting: served.setting }));
    const opened: Opened = Effect.gen(function* runOnStore() {
      const services = yield* Layer.build(layer);
      yield* Effect.provideContext(work, services);
    });
    yield* Effect.scoped(opened).pipe(Effect.catchTag("StorageUnavailable", unavailable(served.redact)));
  });
}

const dbFlag = Flag.String("db").pipe(
  Flag.withFallbackConfig(databasePath),
  Flag.withDescription("The SQLite file (COOKOUT_DB), when DATABASE_URL is unset."),
);

const setupLinkPrinted: ConsoleWork = Effect.gen(function* printSetupLink() {
  const origin = yield* boardOrigin;
  const made = yield* setupLinkFor(origin);
  if (Option.isNone(made)) {
    return yield* refused(adminExists);
  }
  return yield* printLine({ expiresAt: made.value.expiresAt, setupLink: made.value.link });
});

const setupLinkCommand = Command.make("setup-link", { db: dbFlag }, ({ db }) => onStore(db, setupLinkPrinted)).pipe(
  Command.withDescription(
    "Print a fresh setup link, lasting 24 hours, while the cookout has no admin. It replaces any earlier one.",
  ),
);

function loginLinkPrinted(name: string): ConsoleWork {
  return Effect.gen(function* printLoginLink() {
    const origin = yield* boardOrigin;
    const made = yield* consoleLoginLink({ name, origin }).pipe(Effect.catchIf(isRefusal, refusedAs));
    yield* printLine({ expiresAt: made.expiresAt, loginLink: made.link });
  });
}

const loginLinkCommand = Command.make(
  "login-link",
  { db: dbFlag, name: Argument.String("name").pipe(Argument.withDescription("The person's name.")) },
  ({ db, name }) => onStore(db, loginLinkPrinted(name)),
).pipe(
  Command.withDescription(
    "Print a one-time login link, lasting 15 minutes, for the person named, straight from the store: no running server or session needed.",
  ),
);

const adminCommand = Command.make("admin").pipe(
  Command.withDescription("Server console commands, run where `cookout serve` runs, on the same database settings."),
  Command.withSubcommands([setupLinkCommand, loginLinkCommand]),
);

export { adminCommand };
