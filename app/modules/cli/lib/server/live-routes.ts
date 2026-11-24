import { eventRoutes } from "../../../events/server.ts";
import { presenceRoutes } from "../../../presence/server.ts";

const liveRoutes = [...eventRoutes, ...presenceRoutes] as const;

export { liveRoutes };
export { presenceLayer } from "../../../presence/server.ts";
export { scheduledMessageRoutes, scheduledMessagesLayer } from "../../../scheduled-messages/server.ts";
