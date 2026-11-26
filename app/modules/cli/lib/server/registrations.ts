import type { AgentSessionStateFailure, AgentSessionStateFile, AgentSessionStateNeeds } from "./agent-session-state.ts";
import { Array as Arr, Effect, Option, Path, Predicate, Schema, String as Str } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { HarnessSession, HarnessSessionId } from "../../../config/index.ts";
import { identityNamePattern, isIdentityName } from "../../../identities/index.ts";
import { joinPlace, toFailure } from "./adapters/sdk.ts";
import { baseUrlOf } from "../../../http/client.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { filesBeside } from "./agent-session-state.ts";
import { notJoined } from "./adapters/call-failure.ts";
import { pathVariable } from "../../../config/server.ts";

const SESSION_ID_PLACEHOLDER = "{session-id}";
const REGISTRATION_SUFFIX = ".registration.json";
const PRETTY = 2;
const NOTHING = {};
const AT_LEAST_ONE_MINUTE = 1;

const noWakeCommand: CallFailure = {
  code: "usage",
  message: `Give the wake command after --, such as: cookout runner register -- claude -p --resume ${SESSION_ID_PLACEHOLDER}`,
};

const TIMEOUT_DESCRIPTION =
  "With a wake command: the whole minutes each wake run may take, 10 by default. When it passes, the runner kills " +
  "the run's process group, children included, and replies in each given mention's thread that it timed out.";

const badTimeout: CallFailure = {
  code: "usage",
  message:
    "--timeout is the whole minutes a wake run may take before the runner kills it, 1 or more, such as --timeout 30.",
};

const Minutes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(AT_LEAST_ONE_MINUTE));

const RegistrationSchema = Schema.Struct({
  agent: Schema.String.check(Schema.isPattern(identityNamePattern).abort()).pipe(Schema.refine(isIdentityName)),
  directory: Schema.String,
  harness: Schema.String,
  path: Schema.String,
  timeoutMinutes: Schema.optionalKey(Minutes),
  url: Schema.String,
  wakeCommand: Schema.NonEmptyArray(Schema.String),
});

type Registration = typeof RegistrationSchema.Type;

interface RegisteredSession {
  readonly file: AgentSessionStateFile;
  readonly registration: Registration;
}

interface Wake {
  readonly command: Arr.NonEmptyReadonlyArray<string>;
  readonly timeoutMinutes: Option.Option<number>;
}

interface Registering {
  readonly file: AgentSessionStateFile;
  readonly place: HarnessSession;
  readonly wake: Wake;
}

interface Filling {
  readonly agent: Registration["agent"];
  readonly harness: string;
  readonly sessionId: HarnessSessionId;
  readonly url: string;
  readonly wake: Wake;
}

const encodeRegistration = Schema.encodeEffect(Schema.fromJsonString(RegistrationSchema, { space: PRETTY }));

function registrationFor({
  agent,
  harness,
  sessionId,
  url,
  wake,
}: Filling): Effect.Effect<Registration, never, Path.Path> {
  return Effect.gen(function* makeRegistration() {
    const path = yield* Path.Path;
    const found = yield* Effect.orDie(pathVariable);
    const wakeCommand = Arr.map(wake.command, Str.replaceAll(SESSION_ID_PLACEHOLDER, sessionId));
    const timeout = Option.match(wake.timeoutMinutes, {
      onNone: () => NOTHING,
      onSome: (timeoutMinutes) => ({ timeoutMinutes }),
    });
    return { agent, directory: path.resolve("."), harness, path: found, url, wakeCommand, ...timeout };
  });
}

function register({
  file,
  place,
  wake,
}: Registering): Effect.Effect<Registration, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* registerJoinedSession() {
    const stored = yield* file.read;
    const { harness, sessionId } = place;
    if (Option.isNone(stored) || !Predicate.isString(harness) || !Predicate.isString(sessionId)) {
      return yield* Effect.fail(notJoined);
    }
    const { identity, url } = stored.value;
    const registration = yield* registrationFor({ agent: identity, harness, sessionId, url, wake });
    const text = yield* Effect.orDie(encodeRegistration(registration));
    yield* file.writeBeside(REGISTRATION_SUFFIX, text);
    return registration;
  });
}

interface Asked {
  readonly timeoutMinutes: Option.Option<number>;
  readonly words: readonly string[];
}

function wakeOf({ timeoutMinutes, words }: Asked): Effect.Effect<Wake, CallFailure> {
  if (!Arr.isReadonlyArrayNonEmpty(words)) {
    return Effect.fail(noWakeCommand);
  }
  if (Option.exists(timeoutMinutes, (minutes) => !Number.isSafeInteger(minutes) || minutes < AT_LEAST_ONE_MINUTE)) {
    return Effect.fail(badTimeout);
  }
  return Effect.succeed({ command: words, timeoutMinutes });
}

function registerHere(asked: Asked): Effect.Effect<Registration, CallFailure, AgentSessionStateNeeds> {
  return Effect.flatMap(wakeOf(asked), (wake) =>
    Effect.flatMap(joinPlace, ({ file, place }) =>
      Option.match(file, {
        onNone: () => Effect.fail(notJoined),
        onSome: (found) => register({ file: found, place, wake }),
      }),
    ),
  );
}

function opened({ file, registration }: RegisteredSession): Effect.Effect<ClientWithAgentSessionState, CallFailure> {
  return Effect.gen(function* openAsAgent() {
    const stored = yield* file.read;
    if (Option.isNone(stored)) {
      return yield* Effect.fail({
        ...notJoined,
        message: `${registration.agent}'s session has left: join again with --wake to register it again.`,
      });
    }
    const state = stored.value;
    const connection = {
      harness: registration.harness,
      token: state.agentSessionToken,
      url: baseUrlOf(registration.url),
    };
    const client = yield* Effect.try({
      catch: toFailure,
      try: () => createCookoutClient({ ...connection, env: NOTHING }),
    });
    return { client, connection, joined: Option.some({ file, state }), source: "agent session token" as const };
  });
}

const registeredSessions: Effect.Effect<
  readonly RegisteredSession[],
  AgentSessionStateFailure,
  AgentSessionStateNeeds
> = Effect.map(filesBeside({ schema: RegistrationSchema, suffix: REGISTRATION_SUFFIX }), (found) =>
  Arr.map(found, ({ file, value }) => ({ file, registration: value })),
);

export { SESSION_ID_PLACEHOLDER, TIMEOUT_DESCRIPTION, opened, register, registerHere, registeredSessions, wakeOf };
export type { RegisteredSession, Registration, Wake };
