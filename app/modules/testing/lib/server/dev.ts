import { Effect, Schema } from "effect";
import type { CommandLineNeeds } from "./command-line.ts";
import type { Scope } from "effect";
import { sessionFromLoginLink } from "../../../../../scripts/lib/login-link-session.ts";
import { startDevCommand } from "./command-line.ts";

const DevStartLine = Schema.Struct({
  clockUrl: Schema.String,
  database: Schema.String,
  loginLink: Schema.String,
  relayUrl: Schema.String,
  url: Schema.String,
  webUrl: Schema.String,
  webhookFakeUrl: Schema.String,
});

const FakeRoutineLine = Schema.Struct({ fireUrl: Schema.String, sessionUrl: Schema.String });

interface DevProcess extends Readonly<typeof DevStartLine.Type> {
  readonly stop: Effect.Effect<void>;
}

type Started<Line> = Effect.Effect<Line, never, CommandLineNeeds | Scope.Scope>;

const startDev: Started<DevProcess> = Effect.map(
  startDevCommand({ args: ["start"], isReady: Schema.is(DevStartLine) }),
  ({ line, stop }) => ({ ...line, stop }),
);

const startProbedDev: Started<DevProcess> = Effect.map(
  startDevCommand({ args: ["start", "--probe"], isReady: Schema.is(DevStartLine) }),
  ({ line, stop }) => ({ ...line, stop }),
);

function startDevServing(webFolder: string): Started<DevProcess> {
  return Effect.map(
    startDevCommand({ args: ["start", "--web", webFolder], isReady: Schema.is(DevStartLine) }),
    ({ line, stop }) => ({ ...line, stop }),
  );
}

function adminSessionOf({ loginLink, url }: Pick<DevProcess, "loginLink" | "url">): Effect.Effect<string> {
  return Effect.promise(() => sessionFromLoginLink({ link: loginLink, url }));
}

const startFakeRoutine: Started<typeof FakeRoutineLine.Type> = Effect.map(
  startDevCommand({ args: ["fake-routine"], isReady: Schema.is(FakeRoutineLine) }),
  ({ line }) => line,
);

export { type DevProcess, adminSessionOf, startDev, startDevServing, startFakeRoutine, startProbedDev };
