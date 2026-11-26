import { Array as Arr, Effect, Option, Record, Schema, String as Str, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { home, proxyEnvironment } from "../../../config/server.ts";
import { printErrorLine, printLine } from "./output.ts";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Path } from "effect";
import type { Registration } from "./registrations.ts";
import { stateFolderPath } from "./state-folder.ts";

interface RunPlace {
  readonly stateFolder: string;
}

interface Woken {
  readonly item: InboxItem;
  readonly place: RunPlace;
  readonly registration: Registration;
}

const runPlace: Effect.Effect<Option.Option<RunPlace>, never, Path.Path> = Effect.map(
  stateFolderPath,
  Option.map((stateFolder) => ({ stateFolder })),
);

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

function wakeFailed(woke: { readonly agent: string; readonly message: number }) {
  return (error: { readonly message: string }): Effect.Effect<void> =>
    printErrorLine({ ...woke, error: { code: "wake_command_failed", message: error.message } });
}

function wakeRun(woken: Woken): Effect.Effect<void, never, ChildProcessSpawner.ChildProcessSpawner> {
  const { item, registration } = woken;
  return Effect.gen(function* runWakeCommand() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const env = yield* runEnvironment(woken);
    const line = yield* Effect.orDie(encodeLine(item));
    const [command, ...args] = registration.wakeCommand;
    const run = ChildProcess.make(command, args, {
      cwd: registration.directory,
      env,
      extendEnv: false,
      stderr: "inherit",
      stdin: { stream: Stream.encodeText(Stream.make(`${line}\n`)) },
      stdout: "ignore",
    });
    const woke = { agent: registration.agent, message: item.message.id };
    yield* spawner.exitCode(run).pipe(
      Effect.matchEffect({
        onFailure: wakeFailed(woke),
        onSuccess: (exitCode) => printLine({ ...woke, exitCode, type: "wake-run" }),
      }),
    );
  });
}

export { type RunPlace, runPlace, wakeRun };
