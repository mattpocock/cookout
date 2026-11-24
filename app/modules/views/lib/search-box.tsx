import type { Search, SearchState } from "../../search/web.ts";
import { useId, useMemo, useSyncExternalStore } from "react";
import type { Board } from "../../board/index.ts";
import type { BoxOption } from "./search-options.ts";
import { ComboboxField } from "../../design-system/index.tsx";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { SearchResults } from "./search-results.tsx";
import { boxOptionsOf } from "./search-options.ts";
import { useSearchBox } from "./use-search-box.ts";

const TEXT = { label: "Search", placeholder: "Go to or search" } as const;
const NONE = 0;

interface SearchBoxProps {
  readonly board: Board;
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly search: Search;
}

function activeOf(state: SearchState, options: readonly BoxOption[]): number | null {
  if (state.highlighted >= options.length) {
    return null;
  }
  return state.highlighted;
}

function useOptions(props: SearchBoxProps, state: SearchState): readonly BoxOption[] {
  const { board, identities } = props;
  const { channels } = useSyncExternalStore(board.subscribe, board.snapshot);
  const everyone = useSyncExternalStore(identities.subscribe, identities.snapshot);
  return useMemo(() => boxOptionsOf({ channels, identities: everyone, state }), [channels, everyone, state]);
}

export function SearchBox(props: SearchBoxProps): ReactNode {
  const shortcut = props.keymap.shortcutOf("openSearch");
  const list = useId();
  const field = useId();
  const state = useSyncExternalStore(props.search.subscribe, props.search.snapshot);
  const options = useOptions(props, state);
  const shown = state.open && (options.length > NONE || state.found.status !== "idle");
  const { area, choose: handleChoose } = useSearchBox({ ...props, box: field });
  return (
    <div className="relative w-40 shrink-0 md:w-56" ref={area}>
      <ComboboxField
        active={activeOf(state, options)}
        box={field}
        defaultValue={state.query}
        expanded={shown}
        keys={shortcut.keys}
        label={TEXT.label}
        list={list}
        placeholder={`${TEXT.placeholder} (${shortcut.label})`}
      />
      {shown && <SearchResults list={list} onChoose={handleChoose} options={options} state={state} />}
    </div>
  );
}
