import { Array as Arr, Option } from "effect";
import type { At, BookState, Connection, Reach } from "./book.ts";
import type { LiveConnectionId, Presence } from "../../index.ts";
import { heldAs, heldBy, presenceIn } from "./book.ts";

interface Reaching extends At {
  readonly reach: Option.Option<Reach>;
}

function withReach({ identity, reach, state }: Reaching): BookState {
  const next = new Map(state.reach);
  Option.match(reach, {
    onNone: () => next.delete(identity),
    onSome: (kept) => next.set(identity, kept),
  });
  return { ...state, reach: next };
}

function failedResult(reach: Reach): Option.Option<NonNullable<Reach["lastResult"]>> {
  return Option.filter(Option.fromUndefinedOr(reach.lastResult), ({ ok }) => !ok);
}

function runnerWhile(running: boolean): Connection["runner"] {
  if (running) {
    return "waking";
  }
  return "asleep";
}

function withWakeRun(at: At & { readonly running: boolean }): readonly [boolean, BookState] {
  const held = heldBy(at);
  if (!Arr.some([...held.connections.values()], ({ runner }) => runner !== "not a runner")) {
    return [false, at.state];
  }
  const runner = runnerWhile(at.running);
  const connections = new Map(
    Arr.map(
      [...held.connections],
      ([id, connection]: readonly [LiveConnectionId, Connection]) => [id, { ...connection, runner }] as const,
    ),
  );
  return [true, heldAs({ ...at, held: { ...held, connections } })];
}

function isAsleepRunner(at: At): boolean {
  return Arr.some([...heldBy(at).connections.values()], ({ runner }) => runner === "asleep");
}

function reachablePresenceIn(at: At): Presence {
  const live = presenceIn(at);
  const reach = Option.fromUndefinedOr(at.state.reach.get(at.identity));
  if (live.online && isAsleepRunner(at)) {
    return { ...live, wakesOnMention: true };
  }
  if (live.online || Option.isNone(reach)) {
    return live;
  }
  return Option.match(failedResult(reach.value), {
    onNone: () => ({ identity: at.identity, online: true, wakesOnMention: true }),
    onSome: (unreachable) => ({ ...live, unreachable }),
  });
}

function reachKey(presence: Presence): string {
  const { unreachable, wakesOnMention } = presence;
  return Option.match(Option.fromUndefinedOr(unreachable), {
    onNone: () => String(wakesOnMention === true),
    onSome: ({ at, error = "", status = "" }) => `${at} ${String(status)} ${error}`,
  });
}

export { reachKey, reachablePresenceIn, withReach, withWakeRun };
