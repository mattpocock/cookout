import type { Fails, Hub } from "./acks.ts";
import type { FollowResponse, SubscriptionResponse } from "../../index.ts";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { ChannelName } from "../../../channels/index.ts";
import { Effect } from "effect";
import type { MessageId } from "../../../messages/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { channelNotFound } from "../../../channels/server.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { messageNotFound } from "../../../messages/server.ts";
import { orMessageNotFound } from "./acks.ts";

const FORBIDDEN = 403;

type FollowChange = Storage["Service"]["followThread"];

type SubscriptionChange = (identity: IdentityName, channel: ChannelName) => Effect.Effect<boolean, StorageUnavailable>;

interface SubscriptionChanged {
  readonly identity: IdentityName;
  readonly subscription: SubscriptionResponse;
}

interface SubscriptionChanging {
  readonly change: SubscriptionChange;
  readonly subscribed: boolean;
  readonly hub: Hub<SubscriptionChanged>;
}

function agentCantSubscribe(caller: Identity): Refusal {
  return {
    code: "identity_kind",
    message: `${caller.name} is an agent; only people can subscribe to channels.`,
    status: FORBIDDEN,
  };
}

function subscription({
  change,
  hub,
  subscribed,
}: SubscriptionChanging): (caller: Identity, channel: string) => Fails<SubscriptionResponse> {
  return (caller: Identity, channel: string): Fails<SubscriptionResponse> =>
    Effect.gen(function* changeSubscription() {
      if (subscribed && caller.kind === "agent") {
        return yield* Effect.fail(agentCantSubscribe(caller));
      }
      if (!isChannelName(channel)) {
        return yield* Effect.fail(channelNotFound(channel));
      }
      const exists = yield* change(caller.name, channel);
      if (!exists) {
        return yield* Effect.fail(channelNotFound(channel));
      }
      const answer = { channel, subscribed };
      yield* hub.publish({ identity: caller.name, subscription: answer });
      return answer;
    });
}

function messageIdOf(asked: string): Fails<MessageId> {
  const id = Number(asked);
  if (isMessageId(id)) {
    return Effect.succeed(id);
  }
  return Effect.fail(messageNotFound(asked));
}

interface Following {
  readonly change: FollowChange;
  readonly isFollowing: boolean;
}

function following({ change, isFollowing }: Following) {
  return (caller: Identity, asked: string): Fails<FollowResponse> =>
    Effect.gen(function* changeFollow() {
      const id = yield* messageIdOf(asked);
      const thread = yield* Effect.flatMap(change(caller.name, id), orMessageNotFound<MessageId>(asked));
      return { following: isFollowing, thread };
    });
}

export { type SubscriptionChanged, following, subscription };
