import type { AgentSessionState, AgentSessionStateFile } from "../agent-session-state.ts";
import type { CallFailure, CallFailureCode } from "./call-failure.ts";
import { Effect, Option } from "effect";
import { agentSessionExpired, agentSessionRevoked } from "../../../../agent-sessions/index.ts";

interface JoinedSession {
  readonly file: AgentSessionStateFile;
  readonly state: AgentSessionState;
}

function isEnded(code: CallFailureCode): boolean {
  return code === agentSessionRevoked || code === agentSessionExpired;
}

function onAgentSessionEnded(
  joined: Option.Option<JoinedSession>,
): (failure: CallFailure) => Effect.Effect<never, CallFailure> {
  return (failure) =>
    Effect.gen(function* forgetEndedAgentSession() {
      if (!isEnded(failure.code) || Option.isNone(joined)) {
        return yield* Effect.fail(failure);
      }
      yield* joined.value.file.remove;
      const rejoin = `run \`cookout join --as ${joined.value.state.identity}\` to join again`;
      return yield* Effect.fail({
        ...failure,
        message: `${failure.message} The stored agent session token was deleted; ${rejoin}.`,
      });
    });
}

export { type JoinedSession, onAgentSessionEnded };
