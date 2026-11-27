import type {
  AckAllRequest,
  AckAllResponse,
  AckResponse,
  DeactivatedQuietAgentId,
  DeactivationOfferId,
  InboxAlert,
  NudgeId,
  ReadPosition,
} from "../../index.ts";
import type { AckedMessage, Storage, StorageUnavailable } from "../../../storage/server.ts";
import { Array as Arr, DateTime, Effect, Predicate } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { PubSub, Scope } from "effect";
import type { MessageId } from "../../../messages/index.ts";
import type { OfflineAlerts } from "./offline-alerts.ts";
import type { ReadReceipts } from "../../../messages/server.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { messageNotFound } from "../../../messages/server.ts";
import { seenUpTo } from "./reaction-items.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Acked {
  readonly identity: IdentityName;
  readonly readPosition: ReadPosition;
}

interface NudgesRead {
  readonly recipient: IdentityName;
  readonly nudgeIds: readonly NudgeId[];
}

interface Hub<Value> {
  readonly publish: (value: Value) => Effect.Effect<boolean>;
  readonly subscribe: Effect.Effect<PubSub.Subscription<Value>, never, Scope.Scope>;
}

interface AckHubs {
  readonly acked: Hub<Acked>;
  readonly nudgesRead: Hub<NudgesRead>;
  readonly readReceipts: ReadReceipts["Service"];
  readonly offlineAlerts: OfflineAlerts["Service"];
  readonly deactivationOffers: {
    readonly keepUpTo: (caller: Identity, upTo: DeactivationOfferId) => Effect.Effect<void, StorageUnavailable>;
    readonly markDeactivatedQuietAgentsReadUpTo: (
      caller: Identity,
      upTo: DeactivatedQuietAgentId,
    ) => Effect.Effect<void, StorageUnavailable>;
  };
}

interface AckCalls {
  readonly ack: (caller: Identity, id: MessageId) => Fails<AckResponse>;
  readonly ackAll: (caller: Identity, request: AckAllRequest) => Fails<AckAllResponse>;
}

const NO_POSITIONS: readonly ReadPosition[] = [];
const NO_ALERTS: readonly InboxAlert[] = [];

function orMessageNotFound<Value>(asked: string): (value: Value | undefined) => Fails<Value> {
  return (value) => {
    if (Predicate.isUndefined(value)) {
      return Effect.fail(messageNotFound(asked));
    }
    return Effect.succeed(value);
  };
}

interface AcksOn {
  readonly storage: Storage["Service"];
  readonly hubs: AckHubs;
}

function inboxAckedUpTo({ hubs, storage }: AcksOn, caller: Identity, upTo: MessageId): Fails<readonly ReadPosition[]> {
  return Effect.gen(function* ackInbox() {
    const now = yield* DateTime.now;
    const { readPositions, receipts } = yield* storage.ackInbox(caller.name, upTo, isoTimeOf(now));
    yield* seenUpTo({ author: caller.name, storage, upTo });
    yield* Effect.forEach(
      readPositions,
      (readPosition) => hubs.acked.publish({ identity: caller.name, readPosition }),
      {
        concurrency: 1,
        discard: true,
      },
    );
    yield* hubs.readReceipts.publish(receipts);
    return readPositions;
  });
}

function nonMessagesAcked(
  { hubs, storage }: AcksOn,
  caller: Identity,
  { deactivatedQuietAgentsUpTo, deactivationOffersUpTo, nudgesUpTo }: AckAllRequest,
): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* ackNudgesAndOffers() {
    if (Predicate.isNotUndefined(nudgesUpTo)) {
      const nudgeIds = yield* storage.markNudgesReadUpTo(caller.name, nudgesUpTo);
      if (Arr.isReadonlyArrayNonEmpty(nudgeIds)) {
        yield* hubs.nudgesRead.publish({ nudgeIds, recipient: caller.name });
      }
    }
    if (Predicate.isNotUndefined(deactivationOffersUpTo)) {
      yield* hubs.deactivationOffers.keepUpTo(caller, deactivationOffersUpTo);
    }
    if (Predicate.isNotUndefined(deactivatedQuietAgentsUpTo)) {
      yield* hubs.deactivationOffers.markDeactivatedQuietAgentsReadUpTo(caller, deactivatedQuietAgentsUpTo);
    }
  });
}

function acksOn(on: AcksOn): AckCalls {
  const { hubs, storage } = on;
  const { acked: hub, readReceipts } = hubs;
  return {
    ack: (caller, id) =>
      Effect.gen(function* ackMessage() {
        const now = yield* DateTime.now;
        const acked = yield* storage.ackMessage(caller.name, id, isoTimeOf(now));
        const { readPosition, receipts } = yield* orMessageNotFound<AckedMessage>(String(id))(acked);
        yield* hub.publish({ identity: caller.name, readPosition });
        yield* readReceipts.publish(receipts);
        return { readPosition };
      }),
    ackAll: (caller, request) =>
      Effect.gen(function* ackInboxAndAlerts() {
        let readPositions = NO_POSITIONS;
        let alerts = NO_ALERTS;
        const { alertsUpTo, upTo } = request;
        yield* nonMessagesAcked(on, caller, request);
        if (Predicate.isNotUndefined(upTo)) {
          readPositions = yield* inboxAckedUpTo(on, caller, upTo);
        }
        if (Predicate.isNotUndefined(alertsUpTo)) {
          alerts = yield* hubs.offlineAlerts.markAllRead(caller, alertsUpTo);
        }
        return { alerts, readPositions };
      }),
  };
}

export { type Acked, type Fails, type Hub, type NudgesRead, acksOn, orMessageNotFound };
