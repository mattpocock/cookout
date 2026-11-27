import { Effect, Layer, Option, String as Str } from "effect";
import type { IdentityName, Token } from "../../../identities/index.ts";
import { adminTokenSet, setupLinkFor } from "../../../identities/server.ts";
import { printLine, refused } from "./output.ts";
import type { AdminNameIsAgent } from "../../../identities/server.ts";
import type { CommandFailed } from "./output.ts";
import type { Secrets } from "../../../secrets/server.ts";
import type { ServedStorage } from "./serve-stores.ts";
import type { Storage } from "../../../storage/server.ts";
import { serverUrl } from "../../../http/server.ts";

type AdminTokenLayer = ReturnType<typeof adminTokenSet> | Layer.Layer<never>;

function adminTokenLayer({
  admin,
  adminName,
}: {
  readonly admin: Option.Option<Token>;
  readonly adminName: IdentityName;
}): AdminTokenLayer {
  return Option.match(admin, {
    onNone: (): AdminTokenLayer => Layer.empty,
    onSome: (set): AdminTokenLayer => adminTokenSet({ adminName, adminToken: set }),
  });
}

function adminNameIsAgent(failure: Pick<AdminNameIsAgent, "adminName">): Effect.Effect<never, CommandFailed> {
  const agentName = {
    code: "admin_name_agent",
    message: `COOKOUT_ADMIN_NAME is ${failure.adminName}, an agent on this board, and only a human can be an admin. Choose another name.`,
  };
  return refused(agentName);
}

function storageUnavailable(
  redact: (text: string) => string,
): (failure: { readonly message: string }) => Effect.Effect<never, CommandFailed> {
  return ({ message }) => {
    const unavailable = { code: "storage_unavailable", message: redact(message) };
    return refused(unavailable);
  };
}

function originOf(publicUrl: string | undefined, url: string): string {
  return Option.getOrElse(Option.filter(Option.fromUndefinedOr(publicUrl), Str.isNonEmpty), () => url);
}

function setupLinkPrinted(
  origin: string,
): Effect.Effect<void, Effect.Error<ReturnType<typeof setupLinkFor>>, Storage | Secrets> {
  return Effect.flatMap(setupLinkFor(origin), (made) =>
    Effect.forEach(Option.toArray(made), ({ expiresAt, link }) => printLine({ expiresAt, setupLink: link }), {
      concurrency: 1,
      discard: true,
    }),
  );
}

type Announced = Effect.Effect<void, CommandFailed, Storage | Secrets | Effect.Services<typeof serverUrl>>;

function announced({
  publicUrl,
  served,
}: {
  readonly publicUrl: string | undefined;
  readonly served: ServedStorage;
}): Announced {
  return Effect.gen(function* announceStarted() {
    const url = yield* serverUrl;
    yield* setupLinkPrinted(originOf(publicUrl, url));
    yield* printLine({ database: served.database, listening: url });
  }).pipe(Effect.catchTag("StorageUnavailable", storageUnavailable(served.redact)));
}

export { adminNameIsAgent, adminTokenLayer, announced, storageUnavailable };
