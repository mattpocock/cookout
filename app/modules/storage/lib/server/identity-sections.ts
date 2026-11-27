import { Effect } from "effect";
import type { MemoryState } from "./memory-state.ts";
import type { SectionsBesideIdentities } from "./identity-section-types.ts";
import { memoryAdminSetting } from "./admin-setting.ts";
import { memoryIdentities } from "./identities.ts";
import { memoryLoginLinks } from "./login-links-memory.ts";
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
  const { dropLoginLinks, ...loginLinks } = memoryLoginLinks({
    findIdentity: identities.findIdentity,
    issueLoginCredential: loginRequests.issueLoginCredential,
    state,
  });
  const { dropPresence, ...presence } = memoryReach(state);
  const { dropOfflineAlerts, ...offlineAlerts } = memoryOfflineAlerts(state);
  return {
    ...identities,
    ...memoryAdminSetting(identities),
    ...loginRequests,
    ...loginLinks,
    ...presence,
    ...offlineAlerts,
    deactivateIdentity: (name) =>
      Effect.tap(identities.deactivateIdentity(name), ({ status }) =>
        Effect.when(
          Effect.andThen(dropLoginCredentials(name), dropLoginLinks(name)),
          Effect.succeed(status === "deactivated"),
        ),
      ),
    endCredentialsOf: (name, now) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.endCredentialsOf(name, now)),
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
    revokeBelowRevokedTokens: (name, now) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => state.lineage.revokeBelowRevokedTokens(name, now)),
      ),
  };
}

export { memoryIdentityLifecycle } from "./identity-lifecycle-memory.ts";

export { memoryIdentitySections };
