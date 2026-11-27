import { Effect, Function } from "effect";

const SIGNAL_CHECK = 0;

function isAlive(pid: number): Effect.Effect<boolean> {
  return Effect.isSuccess(Effect.try({ catch: Function.constant(pid), try: () => process.kill(pid, SIGNAL_CHECK) }));
}

export { isAlive };
