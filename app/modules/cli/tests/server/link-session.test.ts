import { Effect, String as Str } from "effect";
import { answer, freshDatabasePath, startServe } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { linkIn, sessionFromLoginLink } from "../../../../../scripts/lib/login-link-session.ts";
import { NodeServices } from "@effect/platform-node";
import { request } from "../../../http/client.ts";
import { secretsLive } from "../../../secrets/server.ts";
import { whoamiPath } from "../../../identities/index.ts";

function whoamiOf(url: string, session: string): Effect.Effect<unknown> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${session}` }, method: "GET", path: whoamiPath }),
    ),
    ({ json }) => json,
  );
}

it.effect("the setup link a fresh cookout prints redeems, by the name given, for the first admin's session", () =>
  Effect.scoped(
    Effect.gen(function* redeemSetupLink() {
      const database = yield* freshDatabasePath;
      const server = yield* startServe({ database, redeemSetupLink: false });
      const link = linkIn(Str.split("\n")(server.stdout));
      const session = yield* answer(() => sessionFromLoginLink({ link, name: "admin", url: server.url }));
      const whoami = yield* whoamiOf(server.url, session);

      expect(whoami).toMatchObject({ identity: { admin: true, kind: "human", name: "admin" } });
    }),
  ).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("linkIn finds the first setup link or login link among printed lines, and is empty with none", () =>
  Effect.sync(() => {
    const lines = ["pnpm banner", '{"listening":"http://x"}', '{"loginLink":"http://x/#/login-link/a"}'];

    expect([linkIn(lines), linkIn(['{"setupLink":"s"}', '{"loginLink":"l"}']), linkIn(["{}", "null"])]).toStrictEqual([
      "http://x/#/login-link/a",
      "s",
      "",
    ]);
  }),
);
