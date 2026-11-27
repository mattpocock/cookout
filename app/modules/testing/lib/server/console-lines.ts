import { Array as Arr, Deferred, Effect } from "effect";
import type { Console } from "effect";
import { TestConsole } from "effect/testing";
import { parseLine } from "./cli.ts";

interface Watched<During> {
  readonly during: During;
  readonly stderrLines: readonly string[];
  readonly stdoutJson: readonly unknown[];
  readonly stdoutLines: readonly string[];
}

function textOf(lines: readonly unknown[]): string {
  return Arr.join(Arr.map(lines, String), "\n");
}

interface SignallingConsole {
  readonly console: Console.Console;
  readonly errors: Effect.Effect<readonly string[]>;
  readonly printed: Effect.Effect<readonly unknown[]>;
  readonly watching: Effect.Effect<string>;
}

function watched<During>({
  during,
  errors,
  lines,
}: {
  readonly during: During;
  readonly errors: readonly unknown[];
  readonly lines: readonly unknown[];
}): Watched<During> {
  const stdoutLines = Arr.map(lines, String);
  const stderrLines = Arr.map(errors, String);
  return { during, stderrLines, stdoutJson: Arr.map(stdoutLines, (line) => parseLine(line)), stdoutLines };
}

function signallingConsole(lines: number): Effect.Effect<SignallingConsole> {
  return Effect.gen(function* makeSignallingConsole() {
    const output = yield* TestConsole.make;
    const watching = yield* Deferred.make<string>();
    const printed = yield* Deferred.make<readonly unknown[]>();
    const logged: unknown[] = [];
    const errored: string[] = [];
    const console: Console.Console = {
      ...output,
      error: (...line: readonly unknown[]): void => {
        output.error(...line);
        errored.push(textOf(line));
        Deferred.doneUnsafe(watching, Effect.succeed(textOf(line)));
      },
      log: (...line: readonly unknown[]): void => {
        output.log(...line);
        logged.push(textOf(line));
        if (logged.length >= lines) {
          Deferred.doneUnsafe(printed, Effect.succeed(logged));
        }
      },
    };
    return {
      console,
      errors: Effect.sync(() => [...errored]),
      printed: Deferred.await(printed),
      watching: Deferred.await(watching),
    };
  });
}

export { type Watched, signallingConsole, textOf, watched };
export { parseLine } from "./cli.ts";
