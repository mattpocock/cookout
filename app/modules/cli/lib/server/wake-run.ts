import { Array as Arr, Duration, Effect, Option, Record, Schema, String as Str, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { home, proxyEnvironment } from "../../../config/server.ts";
import { printErrorLine, printLine } from "./output.ts";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Path } from "effect";
import type { Registration } from "./registrations.ts";
import type { WakeRunFailure } from "../../../presence/index.ts";
import { stateFolderPath } from "./state-folder.ts";

interface RunPlace {
  readonly stateFolder: string;
}

interface Woken {
  readonly items: readonly InboxItem[];
  readonly place: RunPlace;
  readonly registration: Registration;
}

const runPlace: Effect.Effect<Option.Option<RunPlace>, never, Path.Path> = Effect.map(
  stateFolderPath,
  Option.map((stateFolder) => ({ stateFolder })),
);

const DEFAULT_TIMEOUT_MINUTES = 10;
const SUCCESS = 0;
const FORCE_KILL_AFTER = "5 seconds";

const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function setOnly(entries: readonly (readonly [string, string])[]): Readonly<Record<string, string>> {
  return Record.fromEntries(Arr.filter(entries, ([, value]) => Str.isNonEmpty(value)));
}

function runEnvironment({ place, registration }: Woken): Effect.Effect<Readonly<Record<string, string>>> {
  return Effect.gen(function* environmentOfRun() {
    const homeFolder = yield* home;
    const proxies = yield* proxyEnvironment;
    return setOnly([
      ["COOKOUT_STATE_DIR", place.stateFolder],
      ["COOKOUT_URL", registration.url],
      ["HOME", homeFolder],
      ["HTTPS_PROXY", proxies.httpsProxy],
      ["HTTP_PROXY", proxies.httpProxy],
      ["NO_PROXY", proxies.noProxy],
      ["PATH", registration.path],
    ]);
  }).pipe(Effect.orDie);
}

interface Woke {
  readonly agent: string;
  readonly messages: readonly number[];
}

function wakeFailed(woke: Woke) {
  return (error: { readonly message: string }): Effect.Effect<Option.Option<WakeRunFailure>> =>
    Effect.as(
      printErrorLine({ ...woke, error: { code: "wake_command_failed", message: error.message } }),
      Option.none(),
    );
}

function exited(woke: Woke, timedOutAfterMinutes: number) {
  return (exitCode: Option.Option<number>): Effect.Effect<Option.Option<WakeRunFailure>> =>
    Option.match(exitCode, {
      onNone: () =>
        Effect.as(
          printLine({ ...woke, timedOutAfterMinutes, type: "wake-run" }),
          Option.some({ timedOutAfterMinutes }),
        ),
      onSome: (code) =>
        Effect.as(
          printLine({ ...woke, exitCode: code, type: "wake-run" }),
          Option.liftPredicate({ exitCode: code }, () => code !== SUCCESS),
        ),
    });
}

function timeoutOf(registration: Registration): number {
  return registration.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
}

function wakeRun(
  woken: Woken,
): Effect.Effect<Option.Option<WakeRunFailure>, never, ChildProcessSpawner.ChildProcessSpawner> {
  const { items, registration } = woken;
  return Effect.gen(function* runWakeCommand() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const env = yield* runEnvironment(woken);
    const line = yield* Effect.orDie(encodeLine({ items }));
    const [command, ...args] = registration.wakeCommand;
    const run = ChildProcess.make(command, args, {
      cwd: registration.directory,
      env,
      extendEnv: false,
      forceKillAfter: FORCE_KILL_AFTER,
      stderr: "inherit",
      stdin: { stream: Stream.encodeText(Stream.make(`${line}\n`)) },
      stdout: "ignore",
    });
    const woke = { agent: registration.agent, messages: Arr.map(items, ({ message }) => message.id) };
    const minutes = timeoutOf(registration);
    return yield* spawner
      .exitCode(run)
      .pipe(
        Effect.timeoutOption(Duration.minutes(minutes)),
        Effect.matchEffect({ onFailure: wakeFailed(woke), onSuccess: exited(woke, minutes) }),
      );
  });
}

export { type RunPlace, runPlace, wakeRun };
