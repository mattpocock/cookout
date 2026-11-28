import type { CookoutClient } from "../../app/modules/sdk/index.ts";
import { createCookoutClient } from "../../app/modules/sdk/index.ts";
import { setTimeout as sleep } from "node:timers/promises";

interface Dropping {
  readonly url: string;
  readonly adminSession: string;
  readonly agent: string;
  readonly agentToken: string;
}

const POLL_MS = 50;
const TRIES = 100;
const NONE = 0;
const ONE = 1;

async function isOffline(admin: CookoutClient, agent: string): Promise<boolean> {
  const { presence } = await admin.presence();
  return presence.some(({ identity, online }) => identity === agent && !online);
}

async function untilOffline(admin: CookoutClient, agent: string, tries: number): Promise<void> {
  if (await isOffline(admin, agent)) {
    return;
  }
  if (tries <= NONE) {
    throw new Error(`${agent} never went offline`);
  }
  await sleep(POLL_MS);
  await untilOffline(admin, agent, tries - ONE);
}

export async function dropWatch({ adminSession, agent, agentToken, url }: Dropping): Promise<void> {
  const connected = Promise.withResolvers<null>();
  const watch = await createCookoutClient({ env: {}, token: agentToken, url }).watch({
    onConnected: () => {
      connected.resolve(null);
    },
  });
  const listening = watch[Symbol.asyncIterator]().next();
  await connected.promise;
  await watch.close();
  await listening.catch(() => null);
  await untilOffline(createCookoutClient({ env: {}, token: adminSession, url }), agent, TRIES);
}
