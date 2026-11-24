import { ResultGroup, ResultOption } from "../../design-system/index.tsx";
import type { BoxOption } from "./search-options.ts";
import { Fragment } from "react";
import type { ParsedQuery } from "../../search/index.ts";
import type { ReactNode } from "react";
import { SearchResultRow } from "./search-result-row.tsx";

interface SearchResultGroupProps {
  readonly label: string;
  readonly entries: readonly { readonly option: BoxOption; readonly index: number }[];
  readonly highlighted: number;
  readonly list: string;
  readonly query: ParsedQuery;
  readonly onChoose: (href: string) => void;
}

export function SearchResultGroup(props: SearchResultGroupProps): ReactNode {
  const handleChoose = props.onChoose;
  return (
    <ResultGroup label={props.label}>
      {props.entries.map(({ index, option }) => (
        <Fragment key={option.href}>
          {option.kind === "jump" && (
            <ResultOption
              detail={option.detail}
              highlighted={index === props.highlighted}
              href={option.href}
              index={index}
              label={option.label}
              list={props.list}
              onChoose={handleChoose}
            />
          )}
          {option.kind === "message" && (
            <SearchResultRow
              highlighted={index === props.highlighted}
              href={option.href}
              index={index}
              list={props.list}
              onChoose={handleChoose}
              query={props.query}
              result={option.result}
            />
          )}
        </Fragment>
      ))}
    </ResultGroup>
  );
}
