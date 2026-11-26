import { Array as Arr, Effect, FileSystem, Option, Path, Record, Schema, Stdio, String as Str, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { parseLine } from "./cli.ts";
import { runMain } from "@effect/platform-node/NodeRuntime";

const FIRST_ARGUMENT = 2;
const SUCCESS = 0;
const POLL = "10 millis";
const MAIN = new URL("../../../../main.ts", import.meta.url);

const SettingsSchema = Schema.Struct({
  ack: Schema.optionalKey(Schema.Boolean),
  exitCode: Schema.optionalKey(Schema.Int),
  log: Schema.String,
  reply: Schema.optionalKey(Schema.String),
  touch: Schema.optionalKey(Schema.String),
  waitFor: Schema.optionalKey(Schema.String),
});

type Settings = typeof SettingsSchema.Type;

const ItemSchema = Schema.Struct({
  channel: Schema.Struct({ name: Schema.String }),
  message: Schema.Struct({ id: Schema.Int }),
});

type Item = typeof ItemSchema.Type;

interface Woken {
  readonly item: Item;
  readonly settings: Settings;
}

type Needs = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path;

const isSettings = Schema.is(SettingsSchema);
const isItem = Schema.is(ItemSchema);
const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const [sessionId = "", settingsText = ""] = process.argv.slice(FIRST_ARGUMENT);

function appendLine(log: string, line: unknown): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function* appendLogLine() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* Effect.orDie(encodeLine(line));
    yield* fs.writeFileString(log, `${text}\n`, { flag: "a" });
  }).pipe(Effect.orDie);
}

function entryOf(line: string): readonly [string, string] {
  const [name, ...value] = Str.split("=")(line);
  return [name, Arr.join(value, "=")];
}

function spawnedEnvironment(): Effect.Effect<Readonly<Record<string, string>>, never, Needs> {
  return Effect.gen(function* readOwnEnvironment() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const lines = yield* spawner.lines(ChildProcess.make("env", [], { extendEnv: true }));
    return Record.fromEntries(Arr.map(lines, entryOf));
  }).pipe(Effect.orDie);
}

function cookout(args: readonly string[]): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* runCookout() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* Effect.orDie(path.fromFileUrl(MAIN));
    const env = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: sessionId };
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(process.execPath, [main, ...args], { env, extendEnv: true, stderr: "inherit" }),
    );
    yield* Effect.when(
      Effect.die(`cookout ${Arr.join(args, " ")} exited ${String(exitCode)}`),
      Effect.succeed(exitCode !== SUCCESS),
    );
  }).pipe(Effect.orDie);
}

function waitUntilExists(file: string): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function* pollForFile() {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(file);
    if (!exists) {
      yield* Effect.sleep(POLL);
      yield* waitUntilExists(file);
    }
  }).pipe(Effect.orDie);
}

function started({ item, settings }: Woken, stdin: string): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* logStart() {
    const env = yield* spawnedEnvironment();
    const line = { argv: process.argv.slice(FIRST_ARGUMENT), cwd: process.cwd(), env, event: "start", stdin };
    yield* appendLine(settings.log, { ...line, message: item.message.id });
  }).pipe(Effect.orDie);
}

function ifSet(
  value: string | undefined,
  then: (text: string) => Effect.Effect<void, never, Needs>,
): Effect.Effect<void, never, Needs> {
  return Option.match(Option.fromNullishOr(value), { onNone: () => Effect.void, onSome: then });
}

function answer({ item, settings }: Woken): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* answerMention() {
    const fs = yield* FileSystem.FileSystem;
    const message = String(item.message.id);
    yield* ifSet(settings.touch, (file) => Effect.orDie(fs.writeFileString(file, message)));
    yield* ifSet(settings.waitFor, waitUntilExists);
    yield* ifSet(settings.reply, (text) =>
      cookout(["message", "post", item.channel.name, text, "--reply-to", message]),
    );
    yield* Effect.when(cookout(["ack", message]), Effect.succeed(settings.ack === true));
  }).pipe(Effect.orDie);
}

function itemOf(stdin: string): Effect.Effect<Item> {
  const item = parseLine(stdin);
  if (isItem(item)) {
    return Effect.succeed(item);
  }
  return Effect.die(`not an inbox item: ${stdin}`);
}

function wake(settings: Settings): Effect.Effect<void, never, Needs | Stdio.Stdio> {
  return Effect.gen(function* fakeWakeRun() {
    const stdio = yield* Stdio.Stdio;
    const stdin = yield* Effect.orDie(stdio.stdin.pipe(Stream.decodeText, Stream.mkString));
    const item = yield* itemOf(stdin);
    yield* started({ item, settings }, stdin);
    yield* answer({ item, settings });
    yield* appendLine(settings.log, { event: "end", message: item.message.id });
    process.exitCode = Option.getOrElse(Option.fromNullishOr(settings.exitCode), () => SUCCESS);
  });
}

const settings = parseLine(settingsText);

runMain(
  Effect.suspend(() => {
    if (!isSettings(settings)) {
      return Effect.die(`not fake wake settings: ${settingsText}`);
    }
    return wake(settings);
  }).pipe(Effect.provide(nodeServices)),
);
