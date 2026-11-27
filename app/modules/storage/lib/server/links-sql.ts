import type { LoginLinksSection } from "./login-links.ts";
import type { SetupLinksSection } from "./setup-links.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { sqlLoginLinks as sqlLoginLinksOnly } from "./login-links-sql.ts";
import { sqlSetupLinks } from "./setup-links-sql.ts";

function sqlLoginLinks(db: SqlDatabase): LoginLinksSection & SetupLinksSection {
  return { ...sqlLoginLinksOnly(db), ...sqlSetupLinks(db) };
}

export { sqlLoginLinks };
