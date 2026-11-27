import type { Message, MessageId } from "../../sdk/index.ts";
import type { Announce } from "./announcer.ts";
import { createCopier } from "./copying.ts";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { copied: "Link copied", copiedText: "Text copied" } as const;

function threadIdOf(message: Message): MessageId {
  if (message.kind === "top-level") {
    return message.id;
  }
  return message.replyTo;
}

function linkOf(message: Message): string {
  const thread = threadIdOf(message);
  const href = hrefOf({ channel: message.channel, message: message.id, name: "thread", thread });
  return new URL(href, globalThis.location.href).href;
}

interface CopyingLink {
  readonly announce: Announce;
  readonly link: () => string;
}

function copyingLink({ announce, link }: CopyingLink): () => void {
  const copy = createCopier();
  return () => {
    copy(link());
    announce(TEXT.copied);
  };
}

interface CopyingMessage {
  readonly announce: Announce;
  readonly message: Message;
}

function copyLinkOf({ announce, message }: CopyingMessage): () => void {
  return copyingLink({ announce, link: () => linkOf(message) });
}

function copyTextOf({ announce, message }: CopyingMessage): () => void {
  const copy = createCopier();
  return () => {
    copy(message.text);
    announce(TEXT.copiedText);
  };
}

export { copyingLink, copyLinkOf, copyTextOf };
