import type { BoxOption } from "./search-options.ts";
import type { ReactNode } from "react";
import { ResultList } from "../../design-system/index.tsx";
import { SearchResultGroup } from "./search-result-group.tsx";
import { parseQuery } from "../../search/index.ts";
import { useMemo } from "react";

const TEXT = { results: "Search results" } as const;

interface SearchResultRowsProps {
  readonly options: readonly BoxOption[];
  readonly query: string;
  readonly highlighted: number;
  readonly list: string;
  readonly onChoose: (href: string) => void;
}

interface Grouped {
  readonly group: BoxOption["group"];
  readonly entries: readonly { readonly option: BoxOption; readonly index: number }[];
}

function groupsOf(options: readonly BoxOption[]): readonly Grouped[] {
  const groups = [...new Set(options.map((option) => option.group))];
  return groups.map((group) => ({
    entries: options.flatMap((option, index) => [{ index, option }].filter(() => option.group === group)),
    group,
  }));
}

export function SearchResultRows(props: SearchResultRowsProps): ReactNode {
  const parsed = useMemo(() => parseQuery(props.query), [props.query]);
  const handleChoose = props.onChoose;
  return (
    <ResultList label={TEXT.results} list={props.list}>
      {groupsOf(props.options).map((grouped) => (
        <SearchResultGroup
          entries={grouped.entries}
          highlighted={props.highlighted}
          key={grouped.group}
          label={grouped.group}
          list={props.list}
          onChoose={handleChoose}
          query={parsed}
        />
      ))}
    </ResultList>
  );
}
