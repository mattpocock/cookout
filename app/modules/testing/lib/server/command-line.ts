import {
  Array as Arr,
  ConfigProvider,
  Console,
  Deferred,
  Effect,
  Fiber,
  Function,
  Layer,
  Option,
  Schema,
  String as Str,
  pipe,
} from "effect";
import { exitCodeAfterFailure, runCookout as runCommandLine } from "../../../cli/server.ts";
import { memoryStorage, storageLayer } from "../../../storage/server.ts";
import { parseLine, signallingConsole, textOf, watched } from "./console-lines.ts";
import type { NodeServices } from "@effect/platform-node/NodeServices";
import type { Scope } from "effect";
import type { Secrets } from "../../../secrets/server.ts";
import type { ServeLayers } from "../../../cli/server.ts";
import { TestConsole } from "effect/testing";
import type { Watched } from "./console-lines.ts";
import { devCommandLine } from "../../../dev/server.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { secretsTest } from "./secrets.ts";
import { testSecretsKey } from "./secrets-key.ts";

interface CliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stderrJson: unknown;
  readonly stdout: string;
  readonly stdoutJson: unknown;
}

interface ServeProcess {
  readonly adminToken: string;
  readonly lines: readonly unknown[];
  readonly stdout: string;
  readonly stop: Effect.Effect<void>;
  readonly url: string;
}

interface ServeOptions {
  readonly adminToken?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly database?: string;
  readonly port?: number;
  readonly storage?: ServeLayers["storage"];
  readonly webFolder?: string;
}

interface Invocation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Needs = NodeServices | Secrets;

interface WatchRun<During, WatchNeeds> extends Invocation {
  readonly lines: number;
  readonly whileWatching: Effect.Effect<During, never, WatchNeeds>;
}

interface CommandLine {
  readonly console: Console.Console;
  readonly env: Readonly<Record<string, string>>;
  readonly program: Effect.Effect<number, never, Needs>;
}

interface Started<Line> {
  readonly line: Line;
  readonly lines: readonly unknown[];
  readonly stdout: string;
  readonly stop: Effect.Effect<void>;
}

const serveAdminToken = "test-admin-token-0123456789abcdef0123456789";
const EXIT_SUCCESS = 0;
const NO_ARGS: readonly string[] = [];
const ANY_FREE_PORT = 0;
const verbLayers: ServeLayers = { storage: Function.constant(memoryStorage) };
const isListening = Schema.is(Schema.Struct({ listening: Schema.String }));

const commandLineServices: Layer.Layer<Needs> = Layer.merge(nodeServices, secretsTest);

function cliResult({ exitCode, stderr, stdout }: Pick<CliResult, "exitCode" | "stderr" | "stdout">): CliResult {
  return { exitCode, stderr, stderrJson: parseLine(stderr), stdout, stdoutJson: parseLine(stdout) };
}

function exitCodeAfter<Failure>(command: Effect.Effect<void, Failure, Needs>): Effect.Effect<number, never, Needs> {
  return Effect.matchCause(command, {
    onFailure: (cause) => exitCodeAfterFailure({ args: NO_ARGS, cause }),
    onSuccess: Function.constant(EXIT_SUCCESS),
  });
}

function exitCodeOf({ console, env, program }: CommandLine): Effect.Effect<number, never, Needs> {
  return program.pipe(
    Effect.provideService(Console.Console, console),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
  );
}

function captured({ env, program }: Omit<CommandLine, "console">): Effect.Effect<CliResult, never, Needs> {
  return Effect.gen(function* runCaptured() {
    const console = yield* TestConsole.make;
    const exitCode = yield* exitCodeOf({ console, env, program });
    const stdout = yield* console.logLines;
    const stderr = yield* console.errorLines;
    return cliResult({ exitCode, stderr: textOf(stderr), stdout: textOf(stdout) });
  });
}

function runCookout({
  args,
  env,
  runnerHost,
}: Invocation & Pick<ServeLayers, "runnerHost">): Effect.Effect<CliResult, never, Needs> {
  const layers = Option.match(Option.fromNullishOr(runnerHost), {
    onNone: () => verbLayers,
    onSome: (host) => ({ ...verbLayers, runnerHost: host }),
  });
  return captured({ env, program: exitCodeAfter(runCommandLine(args, layers)) });
}

function runDev({ args, env }: Invocation): Effect.Effect<CliResult, never, Needs> {
  return captured({ env, program: exitCodeAfter(devCommandLine(args)) });
}

function startUntil<Line>(
  program: Effect.Effect<number, never, Needs>,
  isReady: (line: unknown) => line is Line,
  env: Readonly<Record<string, string>> = {},
): Effect.Effect<Started<Line>, never, Needs | Scope.Scope> {
  return Effect.gen(function* startInProcess() {
    const output = yield* TestConsole.make;
    const ready = yield* Deferred.make<Line>();
    const console: Console.Console = {
      ...output,
      log: (...line: readonly unknown[]): void => {
        output.log(...line);
        const found = pipe(line, Arr.map(parseLine), Arr.findFirst(isReady));
        if (Option.isSome(found)) {
          Deferred.doneUnsafe(ready, Effect.succeed(found.value));
        }
      },
    };
    const server = yield* Effect.forkScoped(exitCodeOf({ console, env, program }));
    const stopped = Effect.andThen(
      Fiber.join(server),
      Effect.die(new Error("The command stopped before it was ready.")),
    );
    const line = yield* Effect.raceFirst(Deferred.await(ready), stopped);
    const lines = yield* output.logLines;
    return {
      line,
      lines: Arr.map(lines, parseLine),
      stdout: textOf(lines),
      stop: Fiber.interrupt(server),
    } satisfies Started<Line>;
  });
}

function serveCommandLine(options: ServeOptions): Omit<CommandLine, "console"> & Pick<ServeProcess, "adminToken"> {
  const { adminToken = serveAdminToken, database, env = {}, port = ANY_FREE_PORT, ...web } = options;
  const listen = ["serve", "--port", String(port), "--host", "127.0.0.1"];
  const db = Option.match(Option.fromNullishOr(database), { onNone: () => [], onSome: (path) => ["--db", path] });
  const args = [...listen, ...db];
  const program = exitCodeAfter(runCommandLine(args, { storage: storageLayer, ...web }));
  const admin = Option.match(Option.liftPredicate(adminToken, Str.isNonEmpty), {
    onNone: () => ({}),
    onSome: (set) => ({ COOKOUT_ADMIN_TOKEN: set }),
  });
  return { adminToken, env: { ...admin, COOKOUT_SECRETS_KEY: testSecretsKey, ...env }, program };
}

function runAdmin({
  args,
  database,
  env = {},
}: Pick<ServeOptions, "database" | "env"> & Pick<Invocation, "args">): Effect.Effect<CliResult, never, Needs> {
  const db = Option.match(Option.fromNullishOr(database), { onNone: () => [], onSome: (path) => ["--db", path] });
  const program = exitCodeAfter(runCommandLine(["admin", ...args, ...db], { storage: storageLayer }));
  return captured({ env: { COOKOUT_SECRETS_KEY: testSecretsKey, ...env }, program });
}

function runServe(options: ServeOptions): Effect.Effect<CliResult, never, Needs> {
  return captured(serveCommandLine(options));
}

function startServe(options: ServeOptions): Effect.Effect<ServeProcess, never, Needs | Scope.Scope> {
  const { adminToken, env, program } = serveCommandLine(options);
  const started = startUntil(program, isListening, env);
  return Effect.map(started, ({ line, ...output }) => ({ ...output, adminToken, url: line.listening }));
}

function watchCookout<During, WatchNeeds>({
  args,
  env,
  lines,
  whileWatching,
}: WatchRun<During, WatchNeeds>): Effect.Effect<Watched<During>, never, Needs | WatchNeeds | Scope.Scope> {
  return Effect.gen(function* watchInProcess() {
    const { console, errors, printed, watching } = yield* signallingConsole(lines);
    const program = exitCodeAfter(runCommandLine(args, verbLayers));
    const command = yield* Effect.forkScoped(exitCodeOf({ console, env, program }));
    yield* watching;
    const during = yield* whileWatching;
    const stdout = yield* printed;
    yield* Fiber.interrupt(command);
    return watched({ during, errors: yield* errors, lines: stdout });
  });
}

interface DevCommand<Line> {
  readonly args: readonly string[];
  readonly isReady: (line: unknown) => line is Line;
}

function startDevCommand<Line>({
  args,
  isReady,
}: DevCommand<Line>): Effect.Effect<Started<Line>, never, Needs | Scope.Scope> {
  return startUntil(exitCodeAfter(devCommandLine(args)), isReady);
}

export {
  type CliResult,
  type Needs as CommandLineNeeds,
  type ServeProcess,
  type ServeOptions,
  type WatchRun,
  cliResult,
  commandLineServices,
  exitCodeAfter,
  exitCodeOf,
  verbLayers,
  runCookout,
  runAdmin,
  runDev,
  startDevCommand,
  runServe,
  startServe,
  watchCookout,
};
