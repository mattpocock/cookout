import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import { chose } from "./menus.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";

interface Posted {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: MessageId;
}

interface Opened extends Posted {
  readonly channel: string;
  readonly close: () => void;
}

interface Opening {
  readonly channel: string;
  readonly title: string | null;
  readonly inThread?: true;
}

async function threadPosted({ channel, title }: Opening): Promise<Posted> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await poster.createMessage({ channel, replyTo: message.id, text: "Noon works." });
  if (title !== null) {
    await poster.setThreadTitle(message.id, title);
  }
  return { parent: message.id, poster, reader };
}

function threadHash({ channel, parent }: Pick<Opened, "channel" | "parent">): string {
  return `#/channels/${channel}/threads/${String(parent)}`;
}

function openingHash(opening: Opening, parent: MessageId): string {
  const { channel } = opening;
  if (opening.inThread === true) {
    return threadHash({ channel, parent });
  }
  return `#/channels/${channel}`;
}

async function openedAt(opening: Opening): Promise<Opened> {
  const posted = await threadPosted(opening);
  const { channel } = opening;
  const close = openAt({ client: posted.reader, hash: openingHash(opening, posted.parent) });
  return { ...posted, channel, close };
}

function titleForm(): HTMLElement {
  return inThread().getByRole("form", { name: "Thread title" });
}

async function focusedTitleBox(): Promise<HTMLInputElement> {
  const box = await vi.waitFor(() => {
    const field = within(titleForm()).getByRole("textbox", { name: "Title" });

    expect(globalThis.document.activeElement).toBe(field);

    return field;
  });
  if (!(box instanceof HTMLInputElement)) {
    throw new TypeError("The title field is no input");
  }
  return box;
}

async function chosenInChannel(item: string): Promise<HTMLInputElement> {
  fireEvent.contextMenu(await inPane().findByText("Deploy at noon?"));
  await chose(item);
  const box = await focusedTitleBox();
  return box;
}

async function storedTitle(opened: Opened): Promise<string | null> {
  const { parent } = await opened.poster.getThread(opened.parent);
  return parent.title ?? null;
}

async function savedFromBox(title: string): Promise<void> {
  fireEvent.change(await focusedTitleBox(), { target: { value: title } });
  fireEvent.submit(titleForm());
  await inThread().findByRole("button", { name: "Edit title" });
}

it("add title in a top-level message's menu in the channel opens its thread's empty title form, which saves", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedAt({ channel: "web-menu-title-add", title: null });

  await expect(chosenInChannel("Add title")).resolves.toHaveProperty("value", "");

  await savedFromBox("Deploy window");

  await expect(storedTitle(opened)).resolves.toBe("Deploy window");
  expect(globalThis.location.hash).toBe(threadHash(opened));

  opened.close();
});

it("edit title in a titled thread's menu in the channel opens the form holding its title", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedAt({ channel: "web-menu-title-edit", title: "Deploy window" });

  await expect(chosenInChannel("Edit title")).resolves.toHaveProperty("value", "Deploy window");

  opened.close();
});

it("a reply's menu has no title item, as only the top-level message carries the thread's title", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedAt({ channel: "web-menu-title-reply", inThread: true, title: null });
  fireEvent.contextMenu(await inThread().findByText("Noon works."));
  await screen.findByRole("menuitem", { name: "Copy text" });

  expect([
    screen.queryByRole("menuitem", { name: "Add title" }),
    screen.queryByRole("menuitem", { name: "Edit title" }),
  ]).toStrictEqual([null, null]);

  opened.close();
});

async function articleOf(text: string): Promise<HTMLElement> {
  const shown = await inPane().findByText(text);
  const article = shown.closest("article");
  if (article === null) {
    throw new TypeError("The text is in no article");
  }
  return article;
}

async function menuKeysOf(text: string, item: string): Promise<string | null> {
  fireEvent.contextMenu(await articleOf(text));
  const choice = await screen.findByRole("menuitem", { name: item });
  const keys = choice.getAttribute("aria-keyshortcuts");
  fireEvent.keyDown(choice, { key: "Escape" });
  await vi.waitFor(() => {
    expect(screen.queryByRole("menu")).toBeNull();
  });
  return keys;
}

async function pressedOn(text: string, key: string): Promise<void> {
  const message = await articleOf(text);
  message.focus();
  fireEvent.keyDown(message, { key });
}

it("e on a top-level message in the channel opens its thread's title form, and the menu names e", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openedAt({ channel: "web-menu-title-key", title: "Deploy window" });

  await expect(menuKeysOf("Deploy at noon?", "Edit title")).resolves.toBe("e");

  await pressedOn("Deploy at noon?", "e");

  await expect(focusedTitleBox()).resolves.toHaveProperty("value", "Deploy window");

  opened.close();
});
