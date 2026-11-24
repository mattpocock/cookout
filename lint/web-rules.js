import { keymapOwner } from "./rules/keymap-owner.js";
import { pageTitleOwner } from "./rules/page-title-owner.js";

const webRules = {
  meta: { name: "web-rules" },
  rules: {
    "keymap-owner": keymapOwner,
    "page-title-owner": pageTitleOwner,
  },
};

export { webRules as default };
