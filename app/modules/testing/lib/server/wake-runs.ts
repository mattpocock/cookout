import { Array as Arr, Effect, FileSystem, Option, Schema, String as Str } from "effect";
import type { Path } from "effect";
import { agentSessionStateFiles } from "./agent-sessions.ts";
import { parseLine } from "./cli.ts";

interface WakeLogLine {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly event: "start" | "end";
  readonly item: unknown;
  readonly message: number;
  readonly stdin: string;
}

interface RegistrationFile {
  readonly content: unknown;
  readonly mode: number;
  readonly stateFileExists: boolean;
}

type Files = FileSystem.FileSystem | Path.Path;

const REGISTRATION_SUFFIX = ".registration.json";
const PERMISSIONS = 0o1000;

const Words = Schema.Array(Schema.String);
const Environment = Schema.Record(Schema.String, Schema.String);
const LoggedSchema = Schema.Struct({
  argv: Schema.optionalKey(Words),
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Environment),
  event: Schema.Literals(["start", "end"]),
  message: Schema.Int,
  stdin: Schema.optionalKey(Schema.String),
});
const isLogged = Schema.is(LoggedSchema);

const hasAgentSessionToken = Schema.is(Schema.Struct({ agentSessionToken: Schema.String }));

function wakeLogLine({
  argv = [],
  cwd = "",
  env = {},
  event,
  message,
  stdin = "",
}: {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly event: "start" | "end";
  readonly message: number;
  readonly stdin?: string;
}): WakeLogLine {
  return { argv, cwd, env, event, item: parseLine(stdin), message, stdin };
}

function wakeLog(file: string): Effect.Effect<readonly WakeLogLine[], never, FileSystem.FileSystem> {
  return Effect.gen(function* readWakeLog() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    const parsed = Arr.map(Arr.filter(Str.split(text, "\n"), Str.isNonEmpty), parseLine);
    return Arr.map(Arr.filter(parsed, isLogged), wakeLogLine);
  }).pipe(Effect.orDie);
}

function wakeEvents(file: string): Effect.Effect<readonly (readonly [string, number])[], never, FileSystem.FileSystem> {
  return Effect.map(
    wakeLog(file),
    Arr.map(({ event, message }) => [event, message] as const),
  );
}

function filesIn(stateFolder: string, registrations: boolean): Effect.Effect<readonly string[], never, Files> {
  return Effect.map(agentSessionStateFiles(stateFolder), (files) =>
    Arr.filter(files, (file) => Str.endsWith(REGISTRATION_SUFFIX)(file) === registrations),
  );
}

function registrationIn(stateFolder: string): Effect.Effect<RegistrationFile, never, Files> {
  return Effect.gen(function* readRegistration() {
    const fs = yield* FileSystem.FileSystem;
    const [file = ""] = yield* filesIn(stateFolder, true);
    const info = yield* fs.stat(file);
    const stateFileExists = yield* fs.exists(Str.replace(REGISTRATION_SUFFIX, ".json")(file));
    const text = yield* fs.readFileString(file);
    return { content: parseLine(text), mode: info.mode % PERMISSIONS, stateFileExists };
  }).pipe(Effect.orDie);
}

function agentSessionTokenIn(stateFolder: string): Effect.Effect<Option.Option<string>, never, Files> {
  return Effect.gen(function* readAgentSessionToken() {
    const fs = yield* FileSystem.FileSystem;
    const [file = ""] = yield* filesIn(stateFolder, false);
    const text = yield* fs.readFileString(file);
    const state = Option.liftPredicate(parseLine(text), hasAgentSessionToken);
    return Option.map(state, ({ agentSessionToken }) => agentSessionToken);
  }).pipe(Effect.orDie);
}

export { type RegistrationFile, type WakeLogLine, agentSessionTokenIn, registrationIn, wakeEvents, wakeLog };
