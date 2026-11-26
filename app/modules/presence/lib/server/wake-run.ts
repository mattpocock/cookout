import { Caller } from "../../../identities/server.ts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import type { IdentityName } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { WakeRunResponseSchema } from "./wire.ts";
import { wakeRunPath } from "../../index.ts";

const NOT_FOUND = 404;

const noRunner: Refusal = {
  code: "not_found",
  message: "You hold no live connection opened by `cookout runner`, so there is no wake run to start or end.",
  status: NOT_FOUND,
};

function wakeRunRoutesOn<Needs>(
  wakeRun: Effect.Effect<(identity: IdentityName, running: boolean) => Effect.Effect<boolean>, never, Needs>,
): readonly Route<Needs | Caller>[] {
  const said = Effect.fnUntraced(function* sayWakeRunOfCaller(running: boolean) {
    const caller = yield* Caller;
    const say = yield* wakeRun;
    const held = yield* say(caller.name, running);
    if (!held) {
      return yield* Effect.fail(noRunner);
    }
    return yield* HttpServerResponse.schemaJson(WakeRunResponseSchema)({ wakeRun: running });
  });
  return [
    { handle: () => said(true), method: "PUT", path: wakeRunPath },
    { handle: () => said(false), method: "DELETE", path: wakeRunPath },
  ];
}

export { wakeRunRoutesOn };
