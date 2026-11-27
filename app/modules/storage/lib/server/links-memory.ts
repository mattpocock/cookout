import type { MemorySetupLinksOptions } from "./setup-links-memory.ts";
import type { SetupLinksSection } from "./setup-links.ts";
import { memoryLoginLinks as memoryLoginLinksOnly } from "./login-links-memory.ts";
import { memorySetupLinks } from "./setup-links-memory.ts";

type MemoryLinks = ReturnType<typeof memoryLoginLinksOnly> & SetupLinksSection;

function memoryLoginLinks(options: MemorySetupLinksOptions): MemoryLinks {
  return { ...memoryLoginLinksOnly(options), ...memorySetupLinks(options) };
}

export { memoryLoginLinks };
