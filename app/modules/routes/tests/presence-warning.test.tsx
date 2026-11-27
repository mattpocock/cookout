import { adminClient, newIdentity } from "./identities.ts";
import { authorDot, offline, online, openedBy, profileDot, rowDot, warned } from "./presence.ts";
import { expect, it } from "vitest";
import type { CookoutClient } from "../../sdk/index.ts";
import { inProfile } from "./regions.ts";

const WARNING = "Offline, went offline unexpectedly";
const SEEN = "Offline, last seen just now";

interface Owned {
  readonly owner: string;
  readonly agent: string;
}

interface Watching {
  readonly owner: CookoutClient;
  readonly agent: CookoutClient;
  readonly drop: () => Promise<void>;
}

async function watchingAgent({ agent, owner }: Owned): Promise<Watching> {
  const human = await newIdentity({ kind: "human", name: owner });
  const aide = await newIdentity({ kind: "agent", name: agent, owner });
  const events = await aide.client.watch();
  return { agent: aide.client, drop: events.close, owner: human.client };
}

it("as the owner, an agent that drops shows the warning on its dot and profile, and reconnecting clears it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-warning-owner" });
  const aide = await newIdentity({ kind: "agent", name: "web-warning-bot", owner: "web-warning-owner" });
  const events = await aide.client.watch();
  await openedBy({ client: owner.client, hash: "#/people/web-warning-bot" });
  await inProfile().findByText("Online · watching");
  await events.close();

  await expect(
    Promise.all([
      rowDot({ label: WARNING, who: "web-warning-bot" }),
      profileDot({ label: WARNING, who: "web-warning-bot" }),
      inProfile().findByText("Went offline unexpectedly just now: connection lost"),
    ]),
  ).resolves.toStrictEqual([warned(WARNING), warned(WARNING), expect.anything()]);

  await aide.client.watch();

  await expect(profileDot({ label: "Online", who: "web-warning-bot" })).resolves.toStrictEqual(online());
});

it("as the owner, an agent that dropped before the page opened shows the warning from the first read", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-warning-early-owner" });
  const aide = await newIdentity({ kind: "agent", name: "web-warning-early-bot", owner: "web-warning-early-owner" });
  const events = await aide.client.watch();
  await events.close();
  await openedBy({ client: owner.client, hash: "#/people/web-warning-early-bot" });

  await expect(profileDot({ label: WARNING, who: "web-warning-early-bot" })).resolves.toStrictEqual(warned(WARNING));
});

it("as another person, an agent that drops shows the plain offline ring and no warning", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { drop } = await watchingAgent({ agent: "web-warning-other-bot", owner: "web-warning-other-owner" });
  const reader = await newIdentity({ kind: "human", name: "web-warning-other-reader" });
  await openedBy({ client: reader.client, hash: "#/people/web-warning-other-bot" });
  await inProfile().findByText("Online · watching");
  await drop();

  await expect(
    Promise.all([
      profileDot({ label: SEEN, who: "web-warning-other-bot" }),
      inProfile().findByText("Offline: connection lost · last seen just now"),
    ]),
  ).resolves.toStrictEqual([offline(SEEN), expect.anything()]);
});

it("as the owner, the author dot of an agent that drops shows the warning beside its messages", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const watching = await watchingAgent({ agent: "web-warning-author-bot", owner: "web-warning-author-owner" });
  await adminClient().createChannel({ name: "web-warning-author" });
  await watching.agent.createMessage({ channel: "web-warning-author", text: "Beep from the dropped bot" });
  await openedBy({ client: watching.owner, hash: "#/channels/web-warning-author" });
  await watching.drop();

  await expect(
    authorDot({ at: "Beep from the dropped bot", label: WARNING, who: "web-warning-author-bot" }),
  ).resolves.toStrictEqual(warned(WARNING));
});
