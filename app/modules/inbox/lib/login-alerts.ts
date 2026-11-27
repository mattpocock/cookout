import type { OfflineAlert, OfflineAlertId } from "../../presence/index.ts";
import type { IdentityName } from "../../identities/index.ts";
import type { IsoTime } from "../../time/index.ts";
import type { PublicId } from "../../logins/index.ts";

type AdminAct = "revoked" | "sent a login link";

const adminActs = ["revoked", "sent a login link"] as const satisfies readonly AdminAct[];

type LoginAlertEvent =
  | {
      readonly kind: "new session";
      readonly session: PublicId;
      readonly sessionKind: "web" | "cli";
      readonly where: string;
      readonly clientIp?: string;
      readonly ended: boolean;
    }
  | {
      readonly kind: "admin act";
      readonly admin: IdentityName;
      readonly act: AdminAct;
      readonly credential: PublicId;
    };

interface LoginAlert {
  readonly id: OfflineAlertId;
  readonly login: LoginAlertEvent;
  readonly raisedAt: IsoTime;
  readonly read: boolean;
}

type InboxAlert = OfflineAlert | LoginAlert;

interface OfflineAlertResponse {
  readonly alert: InboxAlert;
}

function isOfflineAlert(alert: OfflineAlert | { readonly login: unknown }): alert is OfflineAlert {
  return !("login" in alert);
}

export {
  type AdminAct,
  type InboxAlert,
  type LoginAlert,
  type LoginAlertEvent,
  type OfflineAlertResponse,
  adminActs,
  isOfflineAlert,
};
