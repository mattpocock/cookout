import { Array as Arr, Duration, Effect, Option, Schedule } from "effect";
import type { HarnessLiveDelivery, LiveDeliveryNeeds } from "./live-delivery-seam.ts";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Registration } from "./registrations.ts";
import type { RunnerLog } from "./runner-log.ts";
import { liveDeliveryFor } from "./live-delivery-harnesses.ts";

interface Delivering {
  readonly harness: HarnessLiveDelivery;
  readonly log: RunnerLog;
  readonly registration: Registration;
  readonly unreadOf: (items: readonly InboxItem[]) => Effect.Effect<readonly InboxItem[]>;
}

type Given = readonly InboxItem[];

const ACK_POLL = "5 seconds";

function idsOf(items: Given): readonly number[] {
  return Arr.map(items, ({ message }) => message.id);
}

function untilAcked({ harness, unreadOf }: Delivering, given: Given): Effect.Effect<Given> {
  const unread = unreadOf(given);
  const acked = Effect.repeat(unread, { schedule: Schedule.spaced(ACK_POLL), until: Arr.isReadonlyArrayEmpty });
  return Effect.flatMap(Effect.timeoutOption(acked, Duration.minutes(harness.ackWithinMinutes)), (left) =>
    Option.match(left, { onNone: () => unread, onSome: Effect.succeed }),
  );
}

function fellBack({ log, registration }: Delivering, given: Given) {
  const { agent, harness } = registration;
  return (reason: string): Effect.Effect<Given> =>
    Effect.as(log.record(agent, { harness, messages: idsOf(given), reason, type: "fell-back" }), given);
}

function afterPosting(delivering: Delivering, given: Given): Effect.Effect<Given> {
  return Effect.flatMap(untilAcked(delivering, given), (unread) => {
    if (Arr.isReadonlyArrayNonEmpty(unread)) {
      return fellBack(delivering, unread)("not-acked");
    }
    const { harness } = delivering.registration;
    const delivered = { harness, messages: idsOf(given), type: "delivered-live" } as const;
    return Effect.as(delivering.log.record(delivering.registration.agent, delivered), []);
  });
}

interface Asked {
  readonly log: RunnerLog;
  readonly registration: Registration;
  readonly unreadOf: Delivering["unreadOf"];
}

function liveFirst(asked: Asked) {
  const { log, registration } = asked;
  const delivering = { ...asked, harness: liveDeliveryFor(registration) };
  return (given: Given): Effect.Effect<Given, never, LiveDeliveryNeeds> =>
    Effect.flatMap(delivering.harness.reachOf(registration), (reach) => {
      if (reach.kind === "none") {
        return Effect.as(log.record(registration.agent, { messages: idsOf(given), type: "woken" }), given);
      }
      if (reach.kind === "closed") {
        return fellBack(delivering, given)(reach.reason);
      }
      return Effect.matchEffect(reach.post(given), {
        onFailure: fellBack(delivering, given),
        onSuccess: () => afterPosting(delivering, given),
      });
    });
}

export { liveFirst };
