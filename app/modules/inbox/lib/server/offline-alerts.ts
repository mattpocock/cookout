import { Array as Arr, Context, DateTime, Effect, Layer, Option, Predicate, PubSub } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { IdentityChanges, isFeeder } from "../../../identities/server.ts";
import type { InboxAlert, LoginAlert } from "../../index.ts";
import type { OfflineAlertId, OfflineReason, Presence } from "../../../presence/index.ts";
import type { SessionMade, TokensEnded } from "../../../identities/server.ts";
import type { StorageUnavailable, StoredInboxAlert, StoredLoginAlert } from "../../../storage/server.ts";
import { isOfflineAlertId, offlineAlertNotFound } from "../../../presence/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { Storage } from "../../../storage/server.ts";
import type { TriggerFailure } from "../../../triggers/index.ts";
import { isOfflineAlert } from "../../index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface OwnedAlert {
  readonly owner: IdentityName;
  readonly alert: InboxAlert;
}

interface OfflineAlertsService {
  readonly raise: (agent: IdentityName, offlineReason: OfflineReason) => Effect.Effect<void>;
  readonly backOnline: (agent: IdentityName) => Effect.Effect<void>;
  readonly raiseTriggerFailure: (agent: IdentityName, trigger: TriggerFailure) => Effect.Effect<void>;
  readonly triggerCleared: (agent: IdentityName) => Effect.Effect<void>;
  readonly list: (caller: Identity) => Effect.Effect<readonly InboxAlert[], StorageUnavailable>;
  readonly markRead: (caller: Identity, asked: string) => Fails<InboxAlert>;
  readonly markAllRead: (
    caller: Identity,
    upTo: OfflineAlertId,
  ) => Effect.Effect<readonly InboxAlert[], StorageUnavailable>;
  readonly changed: Effect.Effect<PubSub.Subscription<OwnedAlert>, never, Scope.Scope>;
  readonly warningsFor: (viewer: IdentityName) => Effect.Effect<(presence: Presence) => Presence, StorageUnavailable>;
}

class OfflineAlerts extends Context.Service<OfflineAlerts, OfflineAlertsService>()(
  "@ai-hero/cookout/inbox/lib/server/offline-alerts/OfflineAlerts",
) {}

type Publish = (owner: IdentityName) => (alerts: readonly InboxAlert[]) => Effect.Effect<void>;

type Shows = (owner: IdentityName) => Effect.Effect<(alert: StoredInboxAlert) => InboxAlert, StorageUnavailable>;

interface On {
  readonly storage: Storage["Service"];
  readonly publish: Publish;
  readonly shows: Shows;
}

const NOT_FOUND = 404;
const FIRST_PARAMETER = 0;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

const NO_CURRENT = Option.getOrUndefined(Option.none<TokenHash>());

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

function alertNotFound(asked: string): Refusal {
  return { code: offlineAlertNotFound, message: `You have no offline alert ${asked}.`, status: NOT_FOUND };
}

function ownerOf(found: Identity | undefined): Option.Option<IdentityName> {
  return Option.flatMap(Option.fromNullishOr(found), (identity) => {
    if (identity.kind === "agent") {
      return Option.some(identity.owner);
    }
    return Option.none();
  });
}

function ownerOfAgent(storage: Storage["Service"], agent: IdentityName): Effect.Effect<Option.Option<IdentityName>> {
  return storage.findIdentityByName(agent).pipe(Effect.map(ownerOf), Effect.orElseSucceed(Option.none));
}

function ownerToAlert(storage: Storage["Service"], agent: IdentityName): Effect.Effect<Option.Option<IdentityName>> {
  return storage.findIdentityByName(agent).pipe(
    Effect.map((found) => Option.filter(ownerOf(found), () => Predicate.isNotUndefined(found) && !isFeeder(found))),
    Effect.orElseSucceed(Option.none),
  );
}

type Raising = Pick<NewOfflineAlert, "agent" | "offlineReason" | "trigger">;

type NewOfflineAlert = Parameters<Storage["Service"]["recordOfflineAlert"]>[typeof FIRST_PARAMETER];

function raised({ publish, storage }: On, raising: Raising): Effect.Effect<void> {
  return Effect.gen(function* raiseAlert() {
    const owner = yield* ownerToAlert(storage, raising.agent);
    if (Option.isNone(owner)) {
      return;
    }
    const raisedAt = yield* now;
    const alert = yield* storage.recordOfflineAlert({ ...raising, owner: owner.value, raisedAt });
    yield* publish(owner.value)([alert]);
  }).pipe(Effect.ignore);
}

type MarkBack = Storage["Service"]["markBackOnline"];

function wasBack({ publish, storage }: On, agent: IdentityName, markBack: MarkBack): Effect.Effect<void> {
  return Effect.gen(function* markBackOnline() {
    const owner = yield* ownerOfAgent(storage, agent);
    const at = yield* now;
    const back = yield* markBack(agent, at);
    yield* Effect.forEach(Option.toArray(owner), (named) => publish(named)(back), ONE_AT_A_TIME);
  }).pipe(Effect.ignore);
}

function markedRead({ publish, shows, storage }: On, caller: Identity, asked: string): Fails<InboxAlert> {
  return Effect.gen(function* markOneRead() {
    const notFound = alertNotFound(asked);
    const named = Option.liftPredicate(Number(asked), isOfflineAlertId);
    const id = yield* Effect.mapError(Effect.fromOption(named), () => notFound);
    const marked = yield* storage.markAlertRead(caller.name, id);
    const stored = yield* Effect.mapError(Effect.fromNullishOr(marked), () => notFound);
    const show = yield* shows(caller.name);
    const alert = show(stored);
    yield* publish(caller.name)([alert]);
    return alert;
  });
}

function warnedAgents(alerts: readonly StoredInboxAlert[]): ReadonlySet<IdentityName> {
  const offline = Arr.filter(alerts, isOfflineAlert);
  const stillOffline = Arr.filter(offline, ({ backOnlineAt }) => Predicate.isUndefined(backOnlineAt));
  return new Set(Arr.map(stillOffline, ({ agent }) => agent));
}

function warnedIn(warned: ReadonlySet<IdentityName>): (presence: Presence) => Presence {
  return (presence) => {
    if (presence.online || !warned.has(presence.identity)) {
      return presence;
    }
    return { ...presence, warning: true };
  };
}

function warnings(
  storage: Storage["Service"],
  viewer: IdentityName,
): Effect.Effect<(presence: Presence) => Presence, StorageUnavailable> {
  return Effect.map(storage.listAlerts(viewer), (alerts) => warnedIn(warnedAgents(alerts)));
}

function publisher(publishOne: (owned: OwnedAlert) => Effect.Effect<boolean>): Publish {
  return (owner) => (alerts) => Effect.forEach(alerts, (alert) => publishOne({ alert, owner }), ONE_AT_A_TIME);
}

function loginShown(alert: StoredLoginAlert, live: ReadonlySet<string>): LoginAlert {
  const { login } = alert;
  if (login.kind === "admin act") {
    return { ...alert, login };
  }
  return { ...alert, login: { ...login, ended: !live.has(login.session) } };
}

function endedIn(live: ReadonlySet<string>): (alert: StoredInboxAlert) => InboxAlert {
  return (alert) => {
    if (isOfflineAlert(alert)) {
      return alert;
    }
    return loginShown(alert, live);
  };
}

function showsBy(storage: Storage["Service"]): Shows {
  return (owner) =>
    Effect.gen(function* showAlerts() {
      const at = yield* now;
      const sessions = yield* storage.listSessions({ current: NO_CURRENT, identity: owner, now: at });
      return endedIn(new Set(Arr.map(sessions, ({ id }) => id)));
    });
}

function shownIn(
  on: On,
  owner: IdentityName,
  alerts: readonly StoredInboxAlert[],
): Effect.Effect<readonly InboxAlert[], StorageUnavailable> {
  return Effect.map(on.shows(owner), (show) => Arr.map(alerts, show));
}

function shownThenPublished(
  on: On,
  owner: IdentityName,
  alerts: readonly StoredInboxAlert[],
): Effect.Effect<readonly InboxAlert[], StorageUnavailable> {
  return Effect.tap(shownIn(on, owner, alerts), on.publish(owner));
}

function loginOf({ identity: _owner, ...made }: SessionMade): StoredLoginAlert["login"] {
  return { ...made, kind: "new session" };
}

function raisedLogin(on: On, made: SessionMade): Effect.Effect<void> {
  return Effect.gen(function* raiseLoginAlert() {
    const raisedAt = yield* now;
    const alert = yield* on.storage.recordLoginAlert({ login: loginOf(made), owner: made.identity, raisedAt });
    yield* shownThenPublished(on, made.identity, [alert]);
  }).pipe(Effect.ignore);
}

function isEndedSession(alert: InboxAlert): alert is LoginAlert {
  return !isOfflineAlert(alert) && alert.login.kind === "new session" && alert.login.ended;
}

function republishedEnded(on: On, { identity }: TokensEnded): Effect.Effect<void> {
  return Effect.gen(function* republishEnded() {
    const stored = yield* on.storage.listAlerts(identity);
    const shown = yield* shownIn(on, identity, stored);
    yield* on.publish(identity)(Arr.filter(shown, isEndedSession));
  }).pipe(Effect.ignore);
}

const offlineAlertsLayer: Layer.Layer<OfflineAlerts, never, Storage | IdentityChanges> = Layer.effect(
  OfflineAlerts,
  Effect.gen(function* openOfflineAlerts() {
    const storage = yield* Storage;
    const changes = yield* IdentityChanges;
    const hub = yield* PubSub.unbounded<OwnedAlert>();
    const on: On = { publish: publisher((owned) => PubSub.publish(hub, owned)), shows: showsBy(storage), storage };
    yield* changes.onSessionMade((made) => raisedLogin(on, made));
    yield* changes.onTokensEnded((ended) => republishedEnded(on, ended));
    return {
      backOnline: (agent) => wasBack(on, agent, storage.markBackOnline),
      changed: PubSub.subscribe(hub),
      list: (caller) => Effect.flatMap(storage.listAlerts(caller.name), (alerts) => shownIn(on, caller.name, alerts)),
      markAllRead: (caller, upTo) =>
        Effect.flatMap(storage.markAlertsRead(caller.name, upTo), (read) => shownThenPublished(on, caller.name, read)),
      markRead: (caller, asked) => markedRead(on, caller, asked),
      raise: (agent, offlineReason) => raised(on, { agent, offlineReason }),
      raiseTriggerFailure: (agent, trigger) => raised(on, { agent, offlineReason: "trigger failed", trigger }),
      triggerCleared: (agent) => wasBack(on, agent, storage.markTriggerAlertsCleared),
      warningsFor: (viewer) => warnings(storage, viewer),
    } satisfies OfflineAlertsService;
  }),
);

function unread<Alert extends InboxAlert>(alerts: readonly Alert[]): readonly Alert[] {
  return Arr.filter(alerts, ({ read }) => !read);
}

export { OfflineAlerts, offlineAlertsLayer, unread };
