import { Effect } from "effect";
import type { MemoryState } from "./memory-state.ts";
import type { SectionsBesideIdentities } from "./identity-section-types.ts";
import { memoryAdminSetting } from "./admin-setting.ts";
import { memoryIdentities } from "./identities.ts";
import { memoryLoginRequests } from "./login-requests-memory.ts";
import { memoryOfflineAlerts } from "./offline-alerts.ts";
import { memoryReach } from "./reach-sections.ts";

type MemoryIdentitySections = ReturnType<typeof memoryIdentities> & SectionsBesideIdentities;

function memoryIdentitySections(state: MemoryState): MemoryIdentitySections {
  const identities = memoryIdentities(state);
  const { dropLoginCredentials, ...loginRequests } = memoryLoginRequests({
    findIdentity: identities.findIdentity,
    state,
  });
  const { dropPresence, ...presence } = memoryReach(state);
  const { dropOfflineAlerts, ...offlineAlerts } = memoryOfflineAlerts(state);
  return {
    ...identities,
    ...memoryAdminSetting(identities),
    ...loginRequests,
    ...presence,
    ...offlineAlerts,
    deactivateIdentity: (name) =>
      Effect.tap(identities.deactivateIdentity(name), ({ status }) =>
        Effect.when(dropLoginCredentials(name), Effect.succeed(status === "deactivated")),
      ),
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
    removeIdentity: (name, messages) =>
      Effect.tap(identities.removeIdentity(name, messages), ({ status }) =>
        Effect.when(
          Effect.all([dropLoginCredentials(name), dropPresence(name), dropOfflineAlerts(name)], {
            concurrency: 1,
            discard: true,
          }),
          Effect.succeed(status === "deleted"),
        ),
      ),
    revokeBelowRevokedTokens: (name, now) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.revokeBelowRevokedTokens(name, now)),
      ),
  };
}

export { memoryIdentityLifecycle } from "./identity-lifecycle-memory.ts";

export { memoryIdentitySections };
