import type { Keymap } from "../../keymap/index.ts";
import type { PersonKeysSource } from "../../design-system/index.tsx";

function personKeysOf(keymap: Keymap): PersonKeysSource {
  return {
    bind: ({ acts, within }) =>
      keymap.bind({
        actions: { copyName: acts.copyName, messagePerson: acts.message, viewProfile: acts.viewProfile },
        scope: "person",
        within,
      }),
    shortcuts: {
      copyName: keymap.shortcutOf("copyName"),
      message: keymap.shortcutOf("messagePerson"),
      viewProfile: keymap.shortcutOf("viewProfile"),
    },
  };
}

export { personKeysOf };
