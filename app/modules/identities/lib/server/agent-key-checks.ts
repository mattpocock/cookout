import { Caller, ownsAgent, requireOwnerOrAdmin } from "./auth.ts";
import { DateTime, Effect, Predicate, String as Str } from "effect";
import type { HumanIdentity, Identity, IdentityName } from "../../index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Option } from "effect";
import type { PublicId } from "../../../logins/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { echoed } from "../../../http/index.ts";
import { isExpiresIn } from "./login-wire.ts";
import { isIdentityName } from "../../index.ts";
import { isPublicId } from "../../../logins/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNIT_LENGTH = 1;
const START = 0;
const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const SECONDS_IN: ReadonlyMap<string, number> = new Map([
  ["d", DAY],
  ["h", HOUR],
  ["m", MINUTE],
  ["s", SECOND],
]);

type Params = Readonly<Record<string, string>>;
type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable, Caller | Storage>;

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only the person who owns an agent makes its keys: an agent can't make one, for itself or another agent.",
  status: FORBIDDEN,
};

const keyNameInvalid: Refusal = {
  code: "agent_key_name_invalid",
  message: "A key's name is 1-40 lowercase letters, digits, '.', '_' or '-', starting with a letter or digit.",
  status: BAD_REQUEST,
};

const expiryInvalid: Refusal = {
  code: "agent_key_expiry_invalid",
  message:
    "Send expiresIn as a count and a unit (s, m, h or d), such as 30d, or leave it out for a key that never expires.",
  status: BAD_REQUEST,
};

const keyNotFound: Refusal = {
  code: "agent_key_not_found",
  message: "That agent has no live key with that ID. List its keys with cookout agent-key list.",
  status: NOT_FOUND,
};

function agentNotFound(name: string): Refusal {
  return { code: "identity_not_found", message: `There is no agent named ${echoed(name)}.`, status: NOT_FOUND };
}

function notOwner(name: IdentityName): Refusal {
  return { code: "not_owner", message: `Only the person who owns ${name} makes its keys.`, status: FORBIDDEN };
}

function nameTaken(name: string): Refusal {
  return {
    code: "agent_key_name_taken",
    message: `The agent has a live key named ${echoed(name)}. Pick another name, or revoke that key first.`,
    status: CONFLICT,
  };
}

function isHuman(caller: Identity): caller is HumanIdentity {
  return caller.kind === "human";
}

function agentOf(params: Params): Fails<Identity> {
  return Effect.gen(function* findAgent() {
    const name = String(params["name"]);
    if (!isIdentityName(name)) {
      return yield* Effect.fail(agentNotFound(name));
    }
    const storage = yield* Storage;
    const found = yield* storage.findIdentityByName(name);
    if (Predicate.isUndefined(found) || found.kind !== "agent") {
      return yield* Effect.fail(agentNotFound(name));
    }
    return found;
  });
}

function ownedAgent(params: Params): Fails<Identity> {
  return Effect.gen(function* checkOwnedAgent() {
    const caller = yield* Effect.filterOrFail(Caller, isHuman, () => humanOnly);
    const agent = yield* agentOf(params);
    if (!ownsAgent({ caller, target: agent })) {
      return yield* Effect.fail(notOwner(agent.name));
    }
    return agent;
  });
}

function managedAgent(params: Params): Fails<Identity> {
  return Effect.gen(function* checkManagedAgent() {
    const agent = yield* agentOf(params);
    yield* requireOwnerOrAdmin(agent.name);
    return agent;
  });
}

interface Expiring {
  readonly expiresIn: string | undefined;
  readonly now: DateTime.Utc;
}

function expiryOf({ expiresIn, now }: Expiring): Effect.Effect<Option.Option<IsoTime>, Refusal> {
  if (Predicate.isUndefined(expiresIn)) {
    return Effect.succeedNone;
  }
  if (!isExpiresIn(expiresIn)) {
    return Effect.fail(expiryInvalid);
  }
  const count = Number(Str.slice(START, -UNIT_LENGTH)(expiresIn));
  const unit = SECONDS_IN.get(Str.slice(-UNIT_LENGTH)(expiresIn)) ?? SECOND;
  const at = DateTime.add(now, { seconds: count * unit });
  return Effect.succeedSome(isoTimeOf(at));
}

function keyIdOf(params: Params): Effect.Effect<PublicId, Refusal> {
  return Effect.filterOrFail(Effect.succeed(String(params["id"])), isPublicId, () => keyNotFound);
}

export { expiryOf, keyIdOf, keyNameInvalid, keyNotFound, managedAgent, nameTaken, ownedAgent };
