import { FeedText, ResultOption } from "../../design-system/index.tsx";
import type { ParsedQuery } from "../../search/index.ts";
import type { ReactNode } from "react";
import type { SearchResult } from "../../sdk/index.ts";
import { SearchText } from "./search-text.tsx";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const ACTIONS = { reply: "replied in", "top-level": "posted in" } as const;
const CLOSED = "Closed";
const SEPARATOR = " · ";

interface SearchResultRowProps {
  readonly result: SearchResult;
  readonly query: ParsedQuery;
}

function detailOf({ result, time }: { readonly result: SearchResult; readonly time: string }): string {
  const { message } = result;
  const closed = [CLOSED].filter(() => result.threadClosed);
  return [`${ACTIONS[message.kind]} #${message.channel}`, ...closed, time].join(SEPARATOR);
}

export function SearchResultRow(props: SearchResultRowProps): ReactNode {
  const { message } = props.result;
  const { displayName } = useAuthor(message.author);
  const time = useTimeAgo(message.createdAt);
  return (
    <ResultOption detail={detailOf({ result: props.result, time })} label={displayName ?? message.author.name}>
      <FeedText unread>
        <SearchText query={props.query} text={message.text} />
      </FeedText>
    </ResultOption>
  );
}
