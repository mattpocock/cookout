import { Argument, Command } from "effect/cli";
import { Array as Arr, Console, Effect, Option, Stdio, String as Str, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import type { LogOutEverywhereCounts, LogOutEverywhereResponse, PublicId } from "../../../logins/index.ts";
import { callClient, callServer, toFailure, withClient } from "./adapters/sdk.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import { answered } from "./output.ts";
import { baseUrlOf } from "../../../http/client.ts";
import { isPublicId } from "../../../logins/index.ts";
import { removeLogin } from "./logins.ts";

interface Revoked {
  readonly ended: number;
  readonly loggedOut: boolean;
  readonly url: string;
}

const YES = new Set(["y", "yes"]);

const sessionNotFound: CallFailure = {
  code: "session_not_found",
  message: "No session of yours has that id: `cookout login list` prints each one's id.",
};

const noTerminal: CallFailure = {
  code: "usage",
  message: "There is no terminal to confirm on: give --yes to log out everywhere but this machine.",
};

const notConfirmed: CallFailure = {
  code: "not_confirmed",
  message: "Nothing was logged out: Log out everywhere goes ahead only on y or yes.",
};

function revokeAs(id: PublicId): (opened: ClientWithAgentSessionState) => Effect.Effect<Revoked, CallFailure> {
  return (opened) =>
    Effect.gen(function* revokeSession() {
      const { sessions } = yield* callClient((client) => client.listSessions())(opened);
      const isOwn = Arr.some(sessions, (session) => session.current && session.id === id);
      const { ended } = yield* callClient((client) => client.revokeSession(id))(opened);
      return { ended, loggedOut: isOwn && opened.source === "login", url: baseUrlOf(opened.connection.url) };
    });
}

function revoke(given: string): Effect.Effect<Revoked, CallFailure, AgentSessionStateNeeds> {
  if (!isPublicId(given)) {
    return Effect.fail(sessionNotFound);
  }
  return Effect.tap(withClient(revokeAs(given)), ({ loggedOut, url }) => {
    if (loggedOut) {
      return removeLogin(url);
    }
    return Effect.void;
  });
}

function counted({ agentSessions, joinCodes, sessions }: LogOutEverywhereCounts): string {
  return `${String(sessions)} sessions, ${String(agentSessions)} agent sessions and ${String(joinCodes)} join codes`;
}

const confirmedOnTerminal: Effect.Effect<void, CallFailure, Stdio.Stdio> = Effect.gen(function* askToConfirm() {
  const stdio = yield* Stdio.Stdio;
  const isTerminal = yield* stdio.stdinIsTerminal;
  if (!isTerminal) {
    return yield* Effect.fail(noTerminal);
  }
  yield* Console.error("Log out everywhere but this machine? [y/N]");
  const line = yield* stdio.stdin.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.runHead,
    Effect.mapError(toFailure),
  );
  const answer = Str.toLowerCase(Str.trim(Option.getOrElse(line, () => "")));
  if (!YES.has(answer)) {
    return yield* Effect.fail(notConfirmed);
  }
  return yield* Effect.void;
});

function logOutEverywhere(
  yes: boolean,
): Effect.Effect<LogOutEverywhereResponse, CallFailure, AgentSessionStateNeeds | Stdio.Stdio> {
  return Effect.flatMap(Stdio.Stdio, (stdio) =>
    withClient((opened) =>
      Effect.gen(function* endEverywhere() {
        const { willEnd } = yield* callClient((client) => client.previewLogOutEverywhere())(opened);
        yield* Console.error(`Log out everywhere ends ${counted(willEnd)}, and keeps this machine's session.`);
        if (!yes) {
          yield* Effect.provideService(confirmedOnTerminal, Stdio.Stdio, stdio);
        }
        return yield* callClient((client) => client.logOutEverywhere())(opened);
      }),
    ),
  );
}

const loginListCommand = Command.make("list", {}, () => answered(callServer((client) => client.listSessions()))).pipe(
  Command.withDescription(
    "List this person's live sessions, oldest first: each one's id, kind (web or cli), where, madeAt, lastUsedAt, " +
      "expiresAt, the session that approved it (madeBy), and current, true for the one this command sent. An " +
      "agent's credential is refused with human_only.",
  ),
);

const sessionIdArgument = Argument.String("id").pipe(
  Argument.withDescription("The session's id, as `cookout login list` prints it."),
);

const loginRevokeCommand = Command.make("revoke", { id: sessionIdArgument }, ({ id }) => answered(revoke(id))).pipe(
  Command.withDescription(
    "Revoke one of this person's sessions by its id, and every session it approved. Prints how many it ended. When " +
      "it is this machine's own, it also removes this machine's saved Login, as `cookout logout` does (loggedOut). " +
      "An agent's credential is refused with human_only.",
  ),
);

export { loginListCommand, loginRevokeCommand, logOutEverywhere };
