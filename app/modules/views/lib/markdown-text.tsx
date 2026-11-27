import type { Components, Options } from "react-markdown";
import Markdown from "react-markdown";
import { MarkdownLink } from "./markdown-link.tsx";
import { MarkdownMention } from "./markdown-mention.tsx";
import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { remarkMessageText } from "./markdown-tree.ts";
import { useMemo } from "react";

const LINK = "a";

type Plugins = NonNullable<Options["remarkPlugins"]>;

const COMPONENTS: Components = {
  [LINK]: MarkdownLink,
  h1: "strong",
  h2: "strong",
  h3: "strong",
  h4: "strong",
  h5: "strong",
  h6: "strong",
  span: MarkdownMention,
};

interface MarkdownTextProps {
  readonly message: Pick<Message, "mentions" | "text">;
  readonly me: string;
}

export function MarkdownText(props: MarkdownTextProps): ReactNode {
  const { me, message } = props;
  const plugins = useMemo(
    (): Plugins => [remarkGfm, remarkBreaks, [remarkMessageText, { me, mentions: message.mentions }]],
    [me, message.mentions],
  );
  return (
    <Markdown components={COMPONENTS} remarkPlugins={plugins}>
      {message.text}
    </Markdown>
  );
}
