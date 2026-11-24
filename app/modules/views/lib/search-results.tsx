import type { BoxOption } from "./search-options.ts";
import type { ReactNode } from "react";
import { SearchResultRows } from "./search-result-rows.tsx";
import type { SearchState } from "../../search/web.ts";

const TEXT = { none: "No messages match.", searching: "Searching…" } as const;
const NONE = 0;

interface SearchResultsProps {
  readonly state: SearchState;
  readonly options: readonly BoxOption[];
  readonly list: string;
  readonly onChoose: (href: string) => void;
}

function noteOf(state: SearchState): string | null {
  const { found } = state;
  if (found.status === "searching") {
    return TEXT.searching;
  }
  if (found.status === "refused") {
    return found.message;
  }
  if (found.status === "found" && found.results.length === NONE) {
    return TEXT.none;
  }
  return null;
}

export function SearchResults(props: SearchResultsProps): ReactNode {
  const { state } = props;
  const note = noteOf(state);
  const handleChoose = props.onChoose;
  return (
    <div className="absolute top-full right-0 w-[28rem] max-w-[calc(100vw-2rem)] z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border bg-background p-1 shadow-lg">
      <SearchResultRows
        highlighted={state.highlighted}
        list={props.list}
        onChoose={handleChoose}
        options={props.options}
        query={state.query}
      />
      {note !== null && <output className="block px-3 py-2 text-sm text-muted-foreground">{note}</output>}
    </div>
  );
}
