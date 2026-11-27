import type { AgentKeyView } from "../../logins/index.ts";
import type { AgentKeysSnapshot } from "../../composer/index.ts";
import { timeOf } from "../../format/index.ts";

function lastUsedOf(key: AgentKeyView): string {
  const at = key.lastUsedAt ?? null;
  if (at === null) {
    return "never used";
  }
  return `last used ${timeOf(at).full}`;
}

function expiryOf(key: AgentKeyView): string {
  const at = key.expiresAt ?? null;
  if (at === null) {
    return "never expires";
  }
  return `expires ${timeOf(at).full}`;
}

function keyDetail(key: AgentKeyView): string {
  return [`made ${timeOf(key.madeAt).full}`, lastUsedOf(key), expiryOf(key)].join(" · ");
}

function refusalWords(verb: string, step: AgentKeysSnapshot["making"]): string | null {
  if (step.status !== "failed") {
    return null;
  }
  return `Couldn't ${verb} (${step.code}): ${step.message}`;
}

function listingAlert(state: AgentKeysSnapshot): string | null {
  return refusalWords("list the keys", state.listing);
}

function makingAlert(state: AgentKeysSnapshot): string | null {
  return refusalWords("make the key", state.making);
}

function revokingAlert(state: AgentKeysSnapshot): string | null {
  return refusalWords("revoke the key", state.revoking);
}

export { keyDetail, listingAlert, makingAlert, revokingAlert };
