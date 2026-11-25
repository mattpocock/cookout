import type { Act } from "../../keymap/index.ts";
import { THREAD_PANEL } from "./thread-panel.ts";
import { locationOf } from "../../paths/index.ts";

const SIDEBAR_LINK = 'nav[aria-label="Sidebar"] a[href]';
const OPEN_LINK = `${SIDEBAR_LINK}[aria-current="page"]`;
const FEED = '[role="feed"]';
const MESSAGE = "article";
const SELECTED = `${MESSAGE}[aria-current="true"]`;
const BOX = 'textarea[name="text"]';
const PANEL = "aside";
const THREAD = `${PANEL}[aria-label="${THREAD_PANEL.thread}"]`;
const FIRST_REPLY = `${FEED} ${MESSAGE}`;
const TOP = `${MESSAGE}[aria-label="${THREAD_PANEL.parent}"]`;
const LAST = -1;

type ColumnAction = "intoMessageBox" | "intoMessages" | "toFirstReply" | "toSidebar" | "toTopMessage";

interface ColumnKeys {
  readonly watch: (target: () => unknown) => void;
}

function focusedOn(element: unknown): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  element.focus();
  return globalThis.document.activeElement === element;
}

function channelFeed(): HTMLElement | null {
  for (const feed of globalThis.document.querySelectorAll<HTMLElement>(`main ${FEED}`)) {
    if (feed.closest(PANEL) === null) {
      return feed;
    }
  }
  return null;
}

function holds(around: unknown, element: unknown): boolean {
  return around instanceof Node && element instanceof Node && around.contains(element);
}

function isMessage(target: unknown): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(MESSAGE);
}

function inChannelFeed(target: unknown): boolean {
  return isMessage(target) && holds(channelFeed(), target);
}

function toSidebar({ target }: KeyboardEvent): boolean {
  return inChannelFeed(target) && focusedOn(globalThis.document.querySelector(OPEN_LINK));
}

function chosen(): unknown {
  const feed = channelFeed();
  if (feed === null) {
    return null;
  }
  return feed.querySelector(SELECTED) ?? [...feed.querySelectorAll(MESSAGE)].at(LAST);
}

function newestIn(channel: string): unknown {
  const label = `[aria-label="${CSS.escape(`Messages in #${channel}`)}"]`;
  const feed = channelFeed();
  if (!(feed instanceof Element) || feed.closest(label) === null) {
    return null;
  }
  return [...feed.querySelectorAll(MESSAGE)].at(LAST);
}

interface Link {
  readonly link: HTMLAnchorElement;
  readonly channel: string;
}

function linkOf(target: unknown): Link | null {
  if (!(target instanceof HTMLAnchorElement) || !target.matches(SIDEBAR_LINK)) {
    return null;
  }
  const { route } = locationOf(target.hash);
  if (route.name !== "channel") {
    return null;
  }
  return { channel: route.channel, link: target };
}

function intoMessages(keys: ColumnKeys): Act {
  return ({ target }) => {
    const found = linkOf(target);
    if (found === null) {
      return false;
    }
    const { channel, link } = found;
    if (link.matches(OPEN_LINK)) {
      return focusedOn(chosen());
    }
    link.blur();
    globalThis.location.hash = link.hash;
    keys.watch(() => newestIn(channel));
    return true;
  };
}

function outsidePanel(element: unknown): boolean {
  return element instanceof Element && element.closest(PANEL) === null;
}

function channelBox(): unknown {
  for (const box of globalThis.document.querySelectorAll(`main ${BOX}`)) {
    if (outsidePanel(box)) {
      return box;
    }
  }
  return null;
}

function newestOf(around: unknown): unknown {
  if (!(around instanceof Element)) {
    return null;
  }
  return [...around.querySelectorAll(MESSAGE)].at(LAST);
}

function intoMessageBox({ target }: KeyboardEvent): boolean {
  if (!isMessage(target)) {
    return false;
  }
  const panel = target.closest(PANEL);
  if (panel === null) {
    return newestOf(channelFeed()) === target && focusedOn(channelBox());
  }
  return newestOf(panel) === target && focusedOn(panel.querySelector(BOX));
}

function threadOf(target: unknown): Element | null {
  if (!isMessage(target)) {
    return null;
  }
  return target.closest(THREAD);
}

function toTopMessage({ target }: KeyboardEvent): boolean {
  const thread = threadOf(target);
  return (
    thread instanceof Element && thread.querySelector(FIRST_REPLY) === target && focusedOn(thread.querySelector(TOP))
  );
}

function toFirstReply({ target }: KeyboardEvent): boolean {
  const thread = threadOf(target);
  return (
    thread instanceof Element && thread.querySelector(TOP) === target && focusedOn(thread.querySelector(FIRST_REPLY))
  );
}

function columnActions(keys: Readonly<ColumnKeys>): Readonly<Record<ColumnAction, Act>> {
  return { intoMessageBox, intoMessages: intoMessages(keys), toFirstReply, toSidebar, toTopMessage };
}

export { columnActions };
