import { Array as Arr, Effect } from "effect";
import type { BoardAgent, WakeBoard } from "./wake-board.ts";
import type { TestCookout, TestIdentity } from "./cookout.ts";
import { WAKE_CHANNEL, boardAgent } from "./wake-board.ts";
import type { CommandLineNeeds } from "./cli.ts";
import type { FakeWakeSettings } from "./runner.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { Scope } from "effect";
import type { WakeLogLine } from "./wake-runs.ts";
import { answer } from "./calls.ts";
import { fakeWakeCommand } from "./runner.ts";
import { runCookout } from "./cli.ts";

const SUCCESS = 0;

function joinWaking({
  name,
  on,
  settings,
}: {
  readonly name: string;
  readonly on: WakeBoard;
  readonly settings: FakeWakeSettings;
}): Effect.Effect<BoardAgent, never, CommandLineNeeds | TestCookout | Scope.Scope> {
  return Effect.gen(function* joinAndRegister() {
    const joined = yield* boardAgent({ board: on, name });
    const wake = yield* fakeWakeCommand(settings);
    const { exitCode, stderr } = yield* runCookout({
      args: ["join", "--as", name, "--wake", "--", ...wake],
      env: joined.env,
    });
    if (exitCode !== SUCCESS) {
      return yield* Effect.die(`join --wake exited ${String(exitCode)}: ${stderr}`);
    }
    return joined;
  });
}

function mention({ ada, text }: { readonly ada: TestIdentity; readonly text: string }): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => ada.client.createMessage({ channel: WAKE_CHANNEL, text })),
    ({ message }) => message.id,
  );
}

function mentions({
  ada,
  texts,
}: {
  readonly ada: TestIdentity;
  readonly texts: readonly string[];
}): Effect.Effect<readonly MessageId[]> {
  return Effect.forEach(texts, (text) => mention({ ada, text }), { concurrency: 1 });
}

function startsIn(log: readonly WakeLogLine[]): readonly (readonly number[])[] {
  return Arr.map(
    Arr.filter(log, ({ event }) => event === "start"),
    ({ messages }) => messages,
  );
}

function repliesTo({
  ada,
  id,
}: {
  readonly ada: TestIdentity;
  readonly id: MessageId;
}): Effect.Effect<readonly string[]> {
  return Effect.map(
    answer(() => ada.client.getThread(id)),
    ({ replies }) => Arr.map(replies, ({ author, text }) => `${author.name}: ${text}`),
  );
}

export { joinWaking, mention, mentions, repliesTo, startsIn };
