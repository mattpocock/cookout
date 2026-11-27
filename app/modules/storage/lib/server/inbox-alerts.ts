import type { LoginAlert, LoginAlertEvent } from "../../../inbox/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { OfflineAlert } from "../../../presence/index.ts";

type NewSessionEvent = Extract<LoginAlertEvent, { readonly kind: "new session" }>;

type StoredLoginEvent = Omit<NewSessionEvent, "ended"> | Extract<LoginAlertEvent, { readonly kind: "admin act" }>;

interface StoredLoginAlert extends Omit<LoginAlert, "login"> {
  readonly login: StoredLoginEvent;
}

type StoredInboxAlert = OfflineAlert | StoredLoginAlert;

interface NewLoginAlert {
  readonly owner: IdentityName;
  readonly login: StoredLoginEvent;
  readonly raisedAt: IsoTime;
}

export type { NewLoginAlert, StoredInboxAlert, StoredLoginAlert, StoredLoginEvent };
