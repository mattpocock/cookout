import type { IdentitySections } from "./identity-section-types.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { sqlAdminSetting } from "./admin-setting.ts";
import { sqlIdentities } from "./identities.ts";
import { sqlLineage } from "./credential-lineage-sql.ts";
import { sqlLoginRequests } from "./login-requests-sqlite.ts";
import { sqlOfflineAlerts } from "./offline-alerts.ts";
import { sqlReach } from "./reach-sections.ts";

function sqlIdentitySections(db: SqlDatabase): IdentitySections {
  return {
    ...sqlIdentities(db),
    ...sqlAdminSetting(db),
    ...sqlLoginRequests(db),
    ...sqlReach(db),
    ...sqlOfflineAlerts(db),
    ...sqlLineage(db),
  };
}

export { sqlIdentitySections };
