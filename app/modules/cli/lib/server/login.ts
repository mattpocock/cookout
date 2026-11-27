import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option } from "effect";
import { checked, firstLineOnTerminal, givenBoard } from "./board-url.ts";
import { loginListCommand, loginRevokeCommand } from "./login-sessions.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { CommandFailed } from "./output.ts";
import type { LoggedIn } from "./browser-login.ts";
import type { Stdio } from "effect";
import { answered } from "./output.ts";
import { callServerAsPerson } from "./adapters/sdk.ts";
import { logIn } from "./token-login.ts";
import { logInByBrowser } from "./browser-login.ts";
import { throughProxy } from "./adapters/http.ts";

type LoginNeeds = AgentSessionStateNeeds | Stdio.Stdio;

function boardForBrowser(flag: Option.Option<string>): Effect.Effect<string, CallFailure, Stdio.Stdio> {
  return Effect.flatMap(
    givenBoard(flag),
    Option.match({ onNone: () => Effect.flatMap(firstLineOnTerminal, checked), onSome: checked }),
  );
}

function logInWith({ token, url }: LoginFlags): Effect.Effect<LoggedIn, CallFailure, LoginNeeds> {
  if (token) {
    return logIn(url);
  }
  return Effect.flatMap(boardForBrowser(url), logInByBrowser);
}

function proxied<Value>(
  run: Effect.Effect<Value, CallFailure, LoginNeeds>,
): Effect.Effect<Value, CallFailure, LoginNeeds> {
  return Effect.scoped(Effect.andThen(throughProxy, run));
}

const tokenFlag = Flag.Boolean("token").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Read a human identity's token from stdin, never from the command line."),
);

interface LoginFlags {
  readonly token: boolean;
  readonly url: Option.Option<string>;
}

const loginUrlFlag = Flag.String("url").pipe(
  Flag.optional,
  Flag.withDescription(
    "The board's URL, such as https://cookout.fly.dev (a bare host means https://). Default: COOKOUT_URL, else asked for.",
  ),
);

type LoginCommand = Command.Command<"login", LoginFlags, object, CommandFailed, LoginNeeds>;

const loginCodeArgument = Argument.String("code").pipe(
  Argument.withDescription("The user code the waiting `cookout login` printed, such as WDJB-MJHT."),
);

const loginApproveCommand = Command.make("approve", { code: loginCodeArgument }, ({ code }) =>
  answered(callServerAsPerson((client) => client.approveLogin(code))),
).pipe(
  Command.withDescription(
    "Approve another machine's waiting `cookout login` by the code it printed, as a person does on the approval " +
      "page, acting as this machine's Login or COOKOUT_TOKEN. The other machine then collects its own Login. An " +
      "agent's credential is refused with human_only, and inside a harness or a wake run it is refused with " +
      "approval_in_harness, even with COOKOUT_ALLOW_HUMAN=1. Prints the request as approved.",
  ),
);

const loginCommand: LoginCommand = Command.make("login", { token: tokenFlag, url: loginUrlFlag }, (flags) =>
  logInWith(flags).pipe(proxied, answered),
).pipe(
  Command.withDescription(
    "Log this machine in to a board: check it answers as a cookout, print a link and a code, and wait while a person " +
      "approves it in the web UI. With --token, keep a human identity's token instead. The Login is kept in " +
      "$XDG_CONFIG_HOME/cookout/credentials (default ~/.config/cookout/credentials, mode 600), and its board becomes " +
      "this machine's default board, which every command uses when COOKOUT_URL is unset. With no COOKOUT_TOKEN and no " +
      "harness, every command then acts as that person; inside a harness, join uses it to join an agent the " +
      "person owns. An agent's token is refused.",
  ),
  Command.withSubcommands([loginApproveCommand, loginListCommand, loginRevokeCommand]),
);

export { type LoginNeeds, loginCommand, proxied };
