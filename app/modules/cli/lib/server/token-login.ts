import { Effect, Option, Stdio, String as Str, Stream } from "effect";
import { checked, givenBoard, typedOnTerminal } from "./board-url.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { LoggedIn } from "./browser-login.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { saveLogin } from "./logins.ts";
import { toFailure } from "./adapters/sdk.ts";
import { toFailureAt } from "./adapters/http.ts";

const NOTHING = {};

const noToken: CallFailure = {
  code: "usage",
  message: "Give the token on stdin, such as `cookout login --token < token.txt`, or paste it and press Ctrl-D.",
};

const stdinText: Effect.Effect<string, CallFailure, Stdio.Stdio> = Effect.flatMap(Stdio.Stdio, (stdio) =>
  stdio.stdin.pipe(Stream.decodeText, Stream.mkString, Effect.mapError(toFailure)),
);

function tokenIn(text: string): Effect.Effect<string, CallFailure> {
  const token = Str.trim(text);
  if (token === "") {
    return Effect.fail(noToken);
  }
  return Effect.succeed(token);
}

interface TokenOnStdin {
  readonly text: string;
  readonly url: string;
}

function tokenAndBoard(flag: Option.Option<string>): Effect.Effect<TokenOnStdin, CallFailure, Stdio.Stdio> {
  return Effect.flatMap(
    givenBoard(flag),
    Option.match({
      onNone: () =>
        Effect.flatMap(typedOnTerminal, ({ rest, url }) =>
          Effect.map(checked(url), (board) => ({ text: rest, url: board })),
        ),
      onSome: (given) => Effect.zipWith(checked(given), stdinText, (url, text) => ({ text, url })),
    }),
  );
}

function humanOnly(name: string): CallFailure {
  return {
    code: "human_only",
    message: `${name} is an agent. A Login is a person's: log in with a human identity's token, and give an agent its token through COOKOUT_TOKEN.`,
  };
}

function logIn(
  flag: Option.Option<string>,
): Effect.Effect<LoggedIn, CallFailure, AgentSessionStateNeeds | Stdio.Stdio> {
  return Effect.gen(function* keepLogin() {
    const { text, url } = yield* tokenAndBoard(flag);
    const token = yield* tokenIn(text);
    const client = yield* Effect.try({
      catch: toFailure,
      try: () => createCookoutClient({ env: NOTHING, token, url }),
    });
    const { identity } = yield* Effect.tryPromise({ catch: toFailureAt(url), try: () => client.whoami() });
    if (identity.kind !== "human") {
      return yield* Effect.fail(humanOnly(identity.name));
    }
    yield* saveLogin({ token, url });
    return { identity, url };
  });
}

export { logIn };
