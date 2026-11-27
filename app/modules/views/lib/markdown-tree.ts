import { mentionPattern } from "../../messages/index.ts";

const AT_SIGN = 1;
const BLOCK_PARENTS = new Set(["blockquote", "footnoteDefinition", "listItem", "root"]);
const INLINE_PARENTS = new Set([
  "delete",
  "emphasis",
  "heading",
  "link",
  "linkReference",
  "paragraph",
  "strong",
  "tableCell",
]);
const PLAIN_TEXT_LANGUAGES = new Set(["text", "txt"]);
const START = 0;
const WHITESPACE = /\s+/gu;

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly lang?: string | null;
  readonly children?: readonly MarkdownNode[];
  readonly data?: {
    readonly hName: string;
    readonly hProperties: Readonly<Record<string, string>>;
  };
}

interface PlainNode {
  readonly type: string;
  readonly value?: string | undefined;
  readonly children?: readonly PlainNode[] | undefined;
}

interface MentionsShown {
  readonly mentions: readonly string[];
  readonly feeders?: readonly string[];
  readonly me: string;
  readonly inLink?: boolean;
}

function textNode(value: string): MarkdownNode {
  return { type: "text", value };
}

function isFeederIn(name: string, shown: MentionsShown): boolean {
  return (shown.feeders ?? []).includes(name);
}

function whoseMention(name: string, shown: MentionsShown): string {
  if (isFeederIn(name, shown)) {
    return "feeder";
  }
  if (name === shown.me) {
    return "mine";
  }
  return "other";
}

function mentionProperties(name: string, shown: MentionsShown): Readonly<Record<string, string>> {
  const whose = whoseMention(name, shown);
  if (shown.inLink === true) {
    return { dataMention: whose };
  }
  return { dataMention: whose, dataName: name };
}

function mentionNode(name: string, shown: MentionsShown): MarkdownNode {
  return {
    children: [textNode(`@${name}`)],
    data: { hName: "span", hProperties: mentionProperties(name, shown) },
    type: "mention",
  };
}

function splitMentions(text: string, shown: MentionsShown): readonly MarkdownNode[] {
  const pieces: MarkdownNode[] = [];
  let kept = START;
  for (const found of text.matchAll(mentionPattern)) {
    const [name] = found;
    if (shown.mentions.includes(name) || isFeederIn(name, shown)) {
      const at = found.index - AT_SIGN;
      pieces.push(textNode(text.slice(kept, at)), mentionNode(name, shown));
      kept = found.index + name.length;
    }
  }
  pieces.push(textNode(text.slice(kept)));
  return pieces.filter((piece) => piece.type !== "text" || piece.value !== "");
}

function htmlAsText(html: string, parent: string): MarkdownNode {
  const text = textNode(html);
  if (BLOCK_PARENTS.has(parent)) {
    return { children: [text], type: "paragraph" };
  }
  return text;
}

function isPlainText(lang: string | null | undefined): boolean {
  if (typeof lang !== "string") {
    return true;
  }
  return PLAIN_TEXT_LANGUAGES.has(lang.toLowerCase());
}

function codeNode(node: MarkdownNode): MarkdownNode {
  if (!isPlainText(node.lang)) {
    return node;
  }
  return { ...node, data: { hName: "code", hProperties: { dataWrap: "" } } };
}

type ShowChild = (child: MarkdownNode, parent: string) => readonly MarkdownNode[];

function withShownChildren(node: MarkdownNode, show: ShowChild): MarkdownNode {
  if (!("children" in node)) {
    return node;
  }
  const { children = [] } = node;
  return { ...node, children: children.flatMap((child) => show(child, node.type)) };
}

function underOf(node: MarkdownNode, shown: MentionsShown): MentionsShown {
  return { ...shown, inLink: shown.inLink === true || node.type === "link" };
}

function shownNode(node: MarkdownNode, parent: string, shown: MentionsShown): readonly MarkdownNode[] {
  if (typeof node.value !== "string") {
    const under = underOf(node, shown);
    return [withShownChildren(node, (child, parentType) => shownNode(child, parentType, under))];
  }
  if (node.type === "html") {
    return [htmlAsText(node.value, parent)];
  }
  if (node.type === "text") {
    return splitMentions(node.value, shown);
  }
  if (node.type === "code") {
    return [codeNode(node)];
  }
  return [node];
}

function plainPieces(node: PlainNode): string {
  if (node.type === "break") {
    return " ";
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  const { children = [] } = node;
  const pieces = children.map((child) => plainPieces(child));
  if (INLINE_PARENTS.has(node.type)) {
    return pieces.join("");
  }
  return pieces.join(" ");
}

export function remarkMessageText(shown: MentionsShown): (tree: MarkdownNode) => MarkdownNode {
  return (tree) => {
    const [root = tree] = shownNode(tree, "", shown);
    return root;
  };
}

export function plainTextOfTree(tree: PlainNode): string {
  return plainPieces(tree).replaceAll(WHITESPACE, " ").trim();
}
