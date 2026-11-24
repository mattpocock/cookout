import { Array as Arr, Context, DateTime, Effect, Predicate } from "effect";
import { Caller, requireOwnerOrAdmin } from "../../../identities/server.ts";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { ScheduledMessage, ScheduledMessageId } from "../../index.ts";
import type { Storage, StorageUnavailable, StoredScheduledMessage } from "../../../storage/server.ts";
import { channelKnown, createdBy } from "./create.ts";
import { creatorDeactivated, scheduledMessageNotFound } from "./refusals.ts";
import type { NewScheduledMessageRequest } from "./create.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage as StorageService } from "../../../storage/server.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { shownWith } from "./shown.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type Change = "pauseScheduledMessage" | "resumeScheduledMessage" | "deleteScheduledMessage";

type Changing = (caller: Identity, id: ScheduledMessageId) => Fails<ScheduledMessage>;

interface ScheduledMessagesService {
  readonly create: (caller: Identity, asked: NewScheduledMessageRequest) => Fails<ScheduledMessage>;
  readonly list: (channel: string | undefined) => Fails<readonly ScheduledMessage[]>;
  readonly get: (id: ScheduledMessageId) => Fails<ScheduledMessage>;
  readonly pause: Changing;
  readonly resume: Changing;
  readonly remove: Changing;
}

interface ScheduledOn {
  readonly storage: Storage["Service"];
  readonly wake: Effect.Effect<void>;
}

const SEQUENTIAL = { concurrency: 1 } as const;

class ScheduledMessages extends Context.Service<ScheduledMessages, ScheduledMessagesService>()(
  "@ai-hero/cookout/scheduled-messages/lib/server/service/ScheduledMessages",
) {}

function found(storage: Storage["Service"], scheduleId: ScheduledMessageId): Fails<StoredScheduledMessage> {
  return Effect.flatMap(storage.findScheduledMessage(scheduleId), (stored) =>
    Effect.mapError(Effect.fromNullishOr(stored), () => scheduledMessageNotFound(String(scheduleId))),
  );
}

function allowed(storage: Storage["Service"], caller: Identity, creator: IdentityName): Fails<void> {
  if (caller.name === creator) {
    return Effect.void;
  }
  return requireOwnerOrAdmin(creator).pipe(
    Effect.provideService(Caller, caller),
    Effect.provideService(StorageService, storage),
  );
}

function creatorActive(storage: Storage["Service"], creator: IdentityName): Fails<void> {
  return Effect.flatMap(storage.findIdentityByName(creator), (identity) =>
    Effect.when(
      Effect.fail(creatorDeactivated),
      Effect.succeed(Predicate.isNotUndefined(identity) && identity.deactivated === true),
    ),
  );
}

function changeWith(on: ScheduledOn, change: Change): Changing {
  return (caller, id) =>
    Effect.gen(function* changeSchedule() {
      const stored = yield* found(on.storage, id);
      yield* allowed(on.storage, caller, stored.creator);
      yield* Effect.when(
        creatorActive(on.storage, stored.creator),
        Effect.succeed(change === "resumeScheduledMessage"),
      );
      const now = yield* Effect.map(DateTime.now, isoTimeOf);
      const changed = yield* on.storage[change](stored.id, now);
      yield* on.wake;
      return yield* shownWith(on.storage)({ ...stored, ...changed });
    });
}

function listWith(storage: Storage["Service"]): ScheduledMessagesService["list"] {
  return (channel) => {
    const listed = Effect.map(
      storage.listScheduledMessages(),
      Arr.filter((schedule) => Predicate.isUndefined(channel) || schedule.channel === channel),
    );
    const shown = Effect.flatMap(listed, Effect.forEach(shownWith(storage), SEQUENTIAL));
    if (Predicate.isUndefined(channel)) {
      return shown;
    }
    return Effect.andThen(channelKnown({ channel, storage }), shown);
  };
}

function scheduledMessagesOn(on: ScheduledOn): ScheduledMessagesService {
  return {
    create: (caller, asked) =>
      Effect.flatMap(createdBy({ asked, caller, storage: on.storage }), (created) =>
        Effect.andThen(on.wake, shownWith(on.storage)(created)),
      ),
    get: (id) => Effect.flatMap(found(on.storage, id), shownWith(on.storage)),
    list: listWith(on.storage),
    pause: changeWith(on, "pauseScheduledMessage"),
    remove: changeWith(on, "deleteScheduledMessage"),
    resume: changeWith(on, "resumeScheduledMessage"),
  };
}

export { ScheduledMessages, scheduledMessagesOn };
