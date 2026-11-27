import { Context, DateTime, Effect } from "effect";
import { Caller } from "./auth.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;

interface AddressLimitService {
  readonly admit: (address: string) => Effect.Effect<void, Refusal>;
}

class AddressLimit extends Context.Service<AddressLimit, AddressLimitService>()(
  "@ai-hero/cookout/identities/lib/server/login-support/AddressLimit",
) {}

const loginRequestNotFound: Refusal = {
  code: "login_request_not_found",
  message: "There is no such login request: it expired, was collected, or never existed. Run `cookout login` again.",
  status: NOT_FOUND,
};

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only a human identity can approve a login.",
  status: FORBIDDEN,
};

const requireHuman: Effect.Effect<void, Refusal, Caller> = Effect.flatMap(Caller, ({ kind }) => {
  if (kind === "human") {
    return Effect.void;
  }
  return Effect.fail(humanOnly);
});

interface Lifetime {
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

function lifetimeOf(seconds: number): Effect.Effect<Lifetime> {
  return Effect.map(DateTime.now, (started) => ({
    createdAt: isoTimeOf(started),
    expiresAt: isoTimeOf(DateTime.add(started, { seconds })),
  }));
}

export { AddressLimit, lifetimeOf, loginRequestNotFound, now, requireHuman };
export { webSessionWhere } from "./user-agent.ts";
