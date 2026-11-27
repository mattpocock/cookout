import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option } from "effect";
import type { CallFailure } from "./adapters/sdk.ts";
import { answered } from "./output.ts";
import { callServer } from "./adapters/sdk.ts";
import { isPublicId } from "../../../logins/index.ts";

const identityName = Argument.String("name").pipe(Argument.withDescription("The identity's name."));

const revokeWithoutId: CallFailure = {
  code: "usage",
  message: "Name the session to revoke: cookout identity sessions <person> --revoke <id>, with an ID it lists.",
};

function personSessions(name: string, revoke: boolean, id: Option.Option<string>): ReturnType<typeof callServer> {
  if (!revoke) {
    return callServer((client) => client.listIdentitySessions(name));
  }
  return Option.match(Option.filter(id, isPublicId), {
    onNone: () => Effect.fail(revokeWithoutId),
    onSome: (session) => callServer((client) => client.revokeIdentitySession(name, session)),
  });
}

function sessionsOf(name: string, revoke: boolean, id: Option.Option<string>): ReturnType<typeof callServer> {
  return Effect.gen(function* sessionsByKind() {
    const { identity } = yield* callServer((client) => client.getIdentity(name));
    if (identity.kind === "human") {
      return yield* personSessions(name, revoke, id);
    }
    if (revoke) {
      return yield* callServer((client) => client.revokeAgentSession(name));
    }
    return yield* callServer((client) => client.listAgentSessions(name));
  });
}

const identitySessionsCommand = Command.make(
  "sessions",
  {
    name: identityName,
    revoke: Flag.Boolean("revoke").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Revoke an agent's live agent session token, or a person's session with the ID given: its next request is refused.",
      ),
    ),
    session: Argument.String("id").pipe(
      Argument.optional,
      Argument.withDescription("For a person, the ID of the session to revoke, as listed."),
    ),
  },
  ({ name, revoke, session }) => answered(sessionsOf(name, revoke, session)),
).pipe(
  Command.withDescription(
    "List an agent's live agent session (owner or admin), or a person's live sessions (themself or an admin), and " +
      "revoke with --revoke. An admin revoking someone else's alerts them (ADR 0161).",
  ),
);

export { identitySessionsCommand };
