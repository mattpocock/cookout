import { Command, Flag } from "effect/cli";
import { Effect, Option } from "effect";
import { loginFor, removeLogin } from "./logins.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { LoginNeeds } from "./login.ts";
import { answered } from "./output.ts";
import { boardToLogOutOf } from "./board-url.ts";
import { logOutEverywhere } from "./login-sessions.ts";
import { proxied } from "./login.ts";
import { revokedOnServer } from "./browser-login.ts";

interface LoggedOut {
  readonly loggedOut: boolean;
  readonly message?: string;
  readonly revoked?: boolean;
  readonly url: string;
}

const noBoard: LoggedOut = { loggedOut: false, message: "This machine has no default board to log out of.", url: "" };

function logOut(flag: Option.Option<string>): Effect.Effect<LoggedOut, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* forgetLogin() {
    const board = yield* boardToLogOutOf(flag);
    if (Option.isNone(board)) {
      return noBoard;
    }
    const url = board.value;
    const saved = yield* loginFor(url);
    if (Option.isNone(saved)) {
      return { loggedOut: false, message: `There is no Login for ${url}.`, url };
    }
    const revoked = yield* revokedOnServer({ token: saved.value, url });
    yield* removeLogin(url);
    return { loggedOut: true, revoked, url };
  });
}

const logoutUrlFlag = Flag.String("url").pipe(
  Flag.optional,
  Flag.withDescription("The board to log out of. Default: COOKOUT_URL, else this machine's default board."),
);

const everywhereFlag = Flag.Boolean("everywhere").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Log out everywhere but this machine: print what it would end, ask to confirm, then end every other session, " +
      "agent session and join code of this person's on the board every command uses. An agent's credential is " +
      "refused with human_only.",
  ),
);

const yesFlag = Flag.Boolean("yes").pipe(
  Flag.withDefault(false),
  Flag.withDescription("With --everywhere, go ahead without asking to confirm."),
);

interface LogoutFlags {
  readonly everywhere: boolean;
  readonly url: Option.Option<string>;
  readonly yes: boolean;
}

const everywhereWithUrl: CallFailure = {
  code: "usage",
  message: "--everywhere acts on the board every command uses: set COOKOUT_URL rather than --url.",
};

function logOutWith({ everywhere, url, yes }: LogoutFlags): Effect.Effect<unknown, CallFailure, LoginNeeds> {
  if (!everywhere) {
    return logOut(url).pipe(proxied);
  }
  if (Option.isSome(url)) {
    return Effect.fail(everywhereWithUrl);
  }
  return logOutEverywhere(yes);
}

const logoutCommand = Command.make(
  "logout",
  { everywhere: everywhereFlag, url: logoutUrlFlag, yes: yesFlag },
  (flags) => answered(logOutWith(flags)),
).pipe(
  Command.withDescription(
    "Remove this machine's Login for a board, and revoke it on the server if it came from a browser login. With " +
      "--everywhere, log out everywhere but this machine instead.",
  ),
);

export { logoutCommand };
