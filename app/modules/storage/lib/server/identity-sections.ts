import { Effect } from "effect";
import type { Fails } from "./errors.ts";
import type { MemoryState } from "./memory-state.ts";
import type { SectionsBesideIdentities } from "./identity-section-types.ts";
import { memoryAdminSetting } from "./admin-setting.ts";
import { memoryAgentKeys } from "./agent-keys-memory.ts";
import { memoryIdentities } from "./identities.ts";
import { memoryLoginRequests } from "./login-requests-memory.ts";
import { memoryOfflineAlerts } from "./offline-alerts.ts";
import { memoryReach } from "./reach-sections.ts";

type MemoryIdentitySections = Omit<ReturnType<typeof memoryIdentities>, "tokens"> & SectionsBesideIdentities;

function openIn(state: MemoryState): <Done>(work: () => Done) => Fails<Done> {
  return (work) => Effect.andThen(state.ensureOpen, Effect.sync(work));
}

function memoryIdentitySections(state: MemoryState): MemoryIdentitySections {
  const { tokens, ...identities } = memoryIdentities(state);
  const { dropLoginCredentials, ...loginRequests } = memoryLoginRequests({
    findIdentity: identities.findIdentity,
    state,
  });
  const { dropPresence, ...presence } = memoryReach(state);
  const { dropOfflineAlerts, ...offlineAlerts } = memoryOfflineAlerts(state);
  const open = openIn(state);
  return {
    ...identities,
    ...memoryAgentKeys({
      lineage: state.lineage,
      open,
      tokens,
    }),
    ...memoryAdminSetting(identities),
    ...loginRequests,
    ...presence,
    ...offlineAlerts,
    deactivateIdentity: (name) =>
      Effect.tap(identities.deactivateIdentity(name), ({ status }) =>
        Effect.when(dropLoginCredentials(name), Effect.succeed(status === "deactivated")),
      ),
    endCredentialsOf: (name, now) => open(() => state.lineage.endCredentialsOf(name, now)),
    logOutEverywhere: (request) => open(() => state.lineage.logOutEverywhere(request)),
    previewLogOutEverywhere: (request) => open(() => state.lineage.previewLogOutEverywhere(request)),
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
    revokeBelowRevokedTokens: (name, now) => open(() => state.lineage.revokeBelowRevokedTokens(name, now)),
  };
}

export { memoryIdentityLifecycle } from "./identity-lifecycle-memory.ts";

export { memoryIdentitySections };
