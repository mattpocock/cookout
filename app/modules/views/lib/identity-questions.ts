import type { IdentityAction, IdentityActions } from "../../composer/index.ts";
import { deactivationWarning, deletionWarning } from "../../identities/client.ts";
import type { Identity } from "../../sdk/index.ts";

interface Question {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly destructive: boolean;
}

type State = ReturnType<IdentityActions["snapshot"]>;

const NONE: Question = { body: "", confirm: "", destructive: false, title: "" };

const VERBS: Readonly<Record<IdentityAction, string>> = {
  deactivate: "deactivate",
  delete: "delete",
  feed: "make it a feeder",
  reactivate: "reactivate",
  revoke: "revoke the session",
  rotate: "rotate the token",
  transfer: "transfer",
  unfeed: "make it an agent again",
};

function noWarning(): string {
  return "";
}

const WARNINGS: Readonly<Record<IdentityAction, (identity: Identity) => string>> = {
  deactivate: deactivationWarning,
  delete: deletionWarning,
  feed: noWarning,
  reactivate: noWarning,
  revoke: noWarning,
  rotate: noWarning,
  transfer: noWarning,
  unfeed: noWarning,
};

const QUESTIONS: Readonly<Record<IdentityAction, (name: string, to: string) => Question>> = {
  deactivate: (name) => ({
    body: "Its tokens and sessions stop working at once and it can't post; its messages stay. You can reactivate it later.",
    confirm: `Deactivate @${name}`,
    destructive: false,
    title: `Deactivate @${name}?`,
  }),
  delete: (name) => ({
    body: "It has no messages. Its tokens stop working and its name is free again. This can't be undone.",
    confirm: `Delete @${name}`,
    destructive: true,
    title: `Delete @${name}?`,
  }),
  feed: (name) => ({
    body: "It only posts from now on: a typed @name of it mentions no one, reaches no inbox and calls no trigger URL, and it can't watch, read an inbox or join.",
    confirm: `Make @${name} a feeder`,
    destructive: false,
    title: `Make @${name} a feeder?`,
  }),
  reactivate: (name) => ({
    body: "It can post again with a new identity token, shown once here. Its old tokens stay revoked.",
    confirm: `Reactivate @${name}`,
    destructive: false,
    title: `Reactivate @${name}?`,
  }),
  revoke: (name) => ({
    body: "Its live agent session ends at once and can't be used again; it must join again to post.",
    confirm: "Revoke session",
    destructive: true,
    title: `Revoke @${name}'s session?`,
  }),
  rotate: (name) => ({
    body: "Its identity token stops working at once and can't be brought back. The new one is shown once here.",
    confirm: "Rotate token",
    destructive: true,
    title: `Rotate @${name}'s token?`,
  }),
  transfer: (name, to) => ({
    body: `@${to} owns it from now on and can rotate, revoke or deactivate it. An admin can transfer it again.`,
    confirm: `Transfer to @${to}`,
    destructive: false,
    title: `Transfer @${name} to @${to}?`,
  }),
  unfeed: (name) => ({
    body: "A typed @name of it mentions it again, reaching its inbox and trigger URL, and it can watch and join.",
    confirm: `Make @${name} an agent`,
    destructive: false,
    title: `Make @${name} an agent again?`,
  }),
};

interface Asked {
  readonly state: State;
  readonly identity: Identity;
}

function questionOf({ identity, state }: Asked): Question {
  const action = state.confirming;
  if (action === null) {
    return NONE;
  }
  const question = QUESTIONS[action](identity.name, state.transferTo.trim());
  const body = [question.body, WARNINGS[action](identity)].filter((part) => part !== "").join(" ");
  return { ...question, body };
}

function refusalOf(state: State): string | null {
  const { action } = state;
  if (action.status !== "failed") {
    return null;
  }
  return `Couldn't ${VERBS[action.action]} (${action.code}): ${action.message}`;
}

export { questionOf, refusalOf };
