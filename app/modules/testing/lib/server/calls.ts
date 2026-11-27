import { Cause, Effect } from "effect";
import type { IdentityResponse, IdentityWithTokenResponse, Token } from "../../../sdk/index.ts";
import { CookoutError } from "../../../sdk/index.ts";

function isCookoutError(error: unknown): error is CookoutError {
  return error instanceof CookoutError;
}

function answer<Answer>(call: () => Promise<Answer>): Effect.Effect<Answer> {
  return Effect.promise(call);
}

function refusal(call: () => Promise<unknown>): Effect.Effect<CookoutError> {
  return Effect.promise(call).pipe(
    Effect.sandbox,
    Effect.flip,
    Effect.map(Cause.squash),
    Effect.filterOrFail(isCookoutError),
    Effect.orDie,
  );
}

function freshToken(answered: IdentityResponse | IdentityWithTokenResponse): Effect.Effect<Token> {
  if ("token" in answered) {
    return Effect.succeed(answered.token);
  }
  return Effect.die(new Error(`${answered.identity.name} was answered with no token`));
}

export { answer, freshToken, refusal };
