import type { InboxAlert, LoginAlert, OfflineAlert, PublicId, TriggerFailure } from "../../sdk/index.ts";
import { answerTextOf } from "./trigger-answer.ts";
import { timeOf } from "../../format/index.ts";

const TEXT = {
  adminActed: "An admin acted on your credentials: ",
  backOnline: "Back online ",
  cli: "cookout CLI on ",
  consoleActed: "The server console acted on your credentials: ",
  ended: "Session ended",
  live: "Session live",
  newLinkLogin: "New login from a login link: ",
  newLogin: "New login: ",
  reachedAgain: "Reached again ",
  stillOffline: "Still offline",
  stillUnreachable: "Still unreachable",
} as const;

function outcomeOf(failure: TriggerFailure): string {
  return answerTextOf({ answer: failure, silent: "no answer" });
}

function alertTextOf(alert: OfflineAlert): string {
  const trigger = alert.trigger ?? null;
  if (trigger === null) {
    return `@${alert.agent} went offline: ${alert.offlineReason}`;
  }
  const message = String(trigger.message);
  return `@${alert.agent} is unreachable: its trigger URL answered ${outcomeOf(trigger)} to message ${message}`;
}

function triggerBackText(alert: OfflineAlert, ago: string): string {
  if ("backOnlineAt" in alert) {
    return `${TEXT.reachedAgain}${ago}`;
  }
  return TEXT.stillUnreachable;
}

interface Back {
  readonly alert: OfflineAlert;
  readonly ago: string;
}

function backTextOf({ ago, alert }: Back): string {
  if (alert.offlineReason === "trigger failed") {
    return triggerBackText(alert, ago);
  }
  if ("backOnlineAt" in alert) {
    return `${TEXT.backOnline}${ago}`;
  }
  return TEXT.stillOffline;
}

function isLoginAlert(alert: InboxAlert): alert is LoginAlert {
  return "login" in alert;
}

function whereOf(kind: "web" | "cli", where: string): string {
  if (kind === "cli") {
    return `${TEXT.cli}${where}`;
  }
  return where;
}

function leadOf(via: "login link" | undefined): string {
  if (via === "login link") {
    return TEXT.newLinkLogin;
  }
  return TEXT.newLogin;
}

function loginTextOf({ login, raisedAt }: LoginAlert): string {
  const at = timeOf(raisedAt).short;
  if (login.kind === "admin act") {
    if (!("admin" in login)) {
      return `${TEXT.consoleActed}${login.act}, ${at}`;
    }
    return `${TEXT.adminActed}@${login.admin} ${login.act}, ${at}`;
  }
  const where = whereOf(login.sessionKind, login.where);
  return `${leadOf(login.via)}${[where, login.clientIp, at].filter(Boolean).join(", ")}`;
}

function liveSessionOf({ login }: LoginAlert): PublicId | null {
  if (login.kind === "admin act" || login.ended) {
    return null;
  }
  return login.session;
}

function sessionTextOf({ login }: LoginAlert): string {
  if (login.kind === "admin act") {
    return "";
  }
  if (login.ended) {
    return ` · ${TEXT.ended}`;
  }
  return ` · ${TEXT.live}`;
}

export { alertTextOf, backTextOf, isLoginAlert, liveSessionOf, loginTextOf, sessionTextOf };
