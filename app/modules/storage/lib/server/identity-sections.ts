import { Effect } from "effect";
import type { MemoryState } from "./memory-state.ts";
import type { SectionsBesideIdentities } from "./identity-section-types.ts";
import { memoryAdminSetting } from "./admin-setting.ts";
import { memoryAgentKeys } from "./agent-keys-memory.ts";
import { memoryIdentities } from "./identities.ts";
import { memoryLoginLinks } from "./login-links-memory.ts";
import { memoryLoginRequests } from "./login-requests-memory.ts";
import { memoryOfflineAlerts } from "./offline-alerts.ts";
import { memoryReach } from "./reach-sections.ts";

type MemoryIdentitySections = Omit<ReturnType<typeof memoryIdentities>, "tokens"> & SectionsBesideIdentities;

type LineageCalls = Pick<
  MemoryIdentitySections,
  "endCredentialsOf" | "logOutEverywhere" | "previewLogOutEverywhere" | "revokeBelowRevokedTokens"
>;

function memoryLineageCalls(state: MemoryState): LineageCalls {
  return {
    endCredentialsOf: (name, now) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.endCredentialsOf(name, now)),
      ),
    logOutEverywhere: (request) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.logOutEverywhere(request)),
      ),
    previewLogOutEverywhere: (request) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.previewLogOutEverywhere(request)),
      ),
    revokeBelowRevokedTokens: (name, now) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.revokeBelowRevokedTokens(name, now)),
      ),
  };
}

function memoryIdentitySections(state: MemoryState): MemoryIdentitySections {
  const { tokens, ...identities } = memoryIdentities(state);
  const { dropLoginCredentials, ...loginRequests } = memoryLoginRequests({
    findIdentity: identities.findIdentity,
    state,
  });
  const { dropLoginLinks, ...loginLinks } = memoryLoginLinks({
    findIdentity: identities.findIdentity,
    issueLoginCredential: loginRequests.issueLoginCredential,
    state,
  });
  const { dropPresence, ...presence } = memoryReach(state);
  const { dropOfflineAlerts, ...offlineAlerts } = memoryOfflineAlerts(state);
  return {
    ...identities,
    ...memoryAgentKeys({
      lineage: state.lineage,
      open: (work) => Effect.andThen(state.ensureOpen, Effect.sync(work)),
      tokens,
    }),
    ...memoryAdminSetting(identities),
    ...loginRequests,
    ...loginLinks,
    ...presence,
    ...offlineAlerts,
    ...memoryLineageCalls(state),
    deactivateIdentity: (name) =>
      Effect.tap(identities.deactivateIdentity(name), ({ status }) =>
        Effect.when(
          Effect.andThen(dropLoginCredentials(name), dropLoginLinks(name)),
          Effect.succeed(status === "deactivated"),
        ),
      ),
    removeIdentity: (name, messages) =>
      Effect.tap(identities.removeIdentity(name, messages), ({ status }) =>
        Effect.when(
          Effect.all([dropLoginCredentials(name), dropLoginLinks(name), dropPresence(name), dropOfflineAlerts(name)], {
            concurrency: 1,
            discard: true,
          }),
          Effect.succeed(status === "deleted"),
        ),
      ),
  };
}

export { memoryIdentityLifecycle } from "./identity-lifecycle-memory.ts";

export { memoryIdentitySections };
