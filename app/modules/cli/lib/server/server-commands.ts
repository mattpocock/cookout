import type { ServeLayers } from "./serve-stores.ts";
import { adminCommand } from "./admin.ts";
import { serveCommand } from "./serve.ts";

export function serverCommands(layers: ServeLayers): readonly [ReturnType<typeof serveCommand>, typeof adminCommand] {
  return [serveCommand(layers), adminCommand];
}

export { cookoutServer, type ServeLayers } from "./serve.ts";
