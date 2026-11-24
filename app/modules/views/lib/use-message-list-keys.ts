import type { Keymap } from "../../keymap/index.ts";
import { MESSAGE_LIST_ACTIONS } from "./message-list-keys.ts";
import { useEffect } from "react";

export function useMessageListKeys(keymap: Keymap): void {
  useEffect(() => keymap.bind({ actions: MESSAGE_LIST_ACTIONS, scope: "message list" }), [keymap]);
}
