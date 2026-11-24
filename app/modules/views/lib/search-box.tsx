import type { ReactNode } from "react";
import type { Search } from "../../search/web.ts";
import { SearchField } from "./search-field.tsx";
import { SearchResults } from "./search-results.tsx";
import { useSearchBox } from "./use-search-box.ts";
import { useSyncExternalStore } from "react";

interface SearchBoxProps {
  readonly search: Search;
}

export function SearchBox(props: SearchBoxProps): ReactNode {
  const { search } = props;
  const state = useSyncExternalStore(search.subscribe, search.snapshot);
  const area = useSearchBox(search);
  return (
    <div className="relative w-40 shrink-0 md:w-56" ref={area}>
      <SearchField query={state.query} />
      {state.open && state.found.status !== "idle" && <SearchResults state={state} />}
    </div>
  );
}
