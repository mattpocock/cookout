import { Array as Arr, Effect, Function, Option, String as Str } from "effect";
import { loginLinkWebPath, redeemLoginLinkPath } from "../../../logins/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import type { IdentityWithTokenResponse } from "../../../sdk/index.ts";
import { request } from "../../../http/client.ts";
import { sessionCookieName } from "../../../identities/index.ts";

interface Failure {
  readonly code: string;
  readonly message: string;
}

const noSession: Failure = { code: "seed_failed", message: "A person's login link gave no session." };
const prefix = `${sessionCookieName}=`;

function sessionCookieOf(response: HttpResponse): Option.Option<string> {
  return Arr.findFirst(response.headers.getSetCookie(), Str.startsWith(prefix)).pipe(
    Option.flatMap((cookie) => Arr.head(Str.split(";")(cookie))),
    Option.map(Str.slice(prefix.length)),
    Option.filter(Str.isNonEmpty),
  );
}

function seedFailed(error: unknown): Failure {
  return { code: "seed_failed", message: String(error) };
}

function redeemed(url: string, link: string): Effect.Effect<string, Failure> {
  const [, secret = ""] = Str.split(loginLinkWebPath)(link);
  const redeem = { baseUrl: url, body: { secret }, method: "POST", path: redeemLoginLinkPath } as const;
  return Effect.tryPromise({ catch: seedFailed, try: () => request(redeem) }).pipe(
    Effect.flatMap((response) =>
      Option.match(sessionCookieOf(response), {
        onNone: Function.constant(Effect.fail(noSession)),
        onSome: Effect.succeed,
      }),
    ),
  );
}

interface Created {
  readonly url: string;
  readonly created: IdentityWithTokenResponse;
}

function sessionOf({ created, url }: Created): Effect.Effect<string, Failure> {
  return Option.match(Option.fromUndefinedOr(created.loginLink), {
    onNone: Function.constant(Effect.fail(noSession)),
    onSome: ({ link }) => redeemed(url, link),
  });
}

export { sessionOf };
