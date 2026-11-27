import { Duration, Effect, Predicate } from "effect";
import type { CallFailure } from "./adapters/sdk.ts";

const POLL_SECONDS = 2;

const pollEvery = Duration.seconds(POLL_SECONDS);

function isRateLimited(failure: CallFailure): boolean {
  return failure.code === "rate_limited";
}

function retryAfterOf({ details }: CallFailure): Duration.Duration {
  if (Predicate.hasProperty(details, "retryAfterSeconds") && Predicate.isNumber(details.retryAfterSeconds)) {
    return Duration.seconds(details.retryAfterSeconds);
  }
  return pollEvery;
}

export function waitingOutRateLimits<Value>(
  again: Effect.Effect<Value, CallFailure>,
): (collect: Effect.Effect<Value, CallFailure>) => Effect.Effect<Value, CallFailure> {
  return Effect.catchIf(isRateLimited, (failure) => Effect.andThen(Effect.sleep(retryAfterOf(failure)), again));
}

export { pollEvery };
