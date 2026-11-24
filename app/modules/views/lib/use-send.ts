import type { Draft } from "../../composer/index.ts";
import { useCallback } from "react";

interface SendOf {
  readonly draft: Draft;
  readonly onPost: (text: string, posted: () => void) => void;
}

function useSend({ draft, onPost }: SendOf): (sent: string) => void {
  return useCallback(
    (sent: string) => {
      if (sent.trim() !== "") {
        onPost(sent, draft.clear);
      }
    },
    [draft, onPost],
  );
}

export { useSend };
