import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";
import { whoamiPath } from "../../../identities/index.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const OK = 200;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const CLAUDE_CODE = { AI_AGENT: "claude-code", CLAUDECODE: "1" } as const;

function envFor(cookout: TestCookoutService, token: string): Readonly<Record<string, string>> {
  return { COOKOUT_TOKEN: token, COOKOUT_URL: cookout.url };
}

function whoamiWithTool(
  cookout: TestCookoutService,
  token: string,
  tool: string,
): Effect.Effect<number, never, HttpClient.HttpClient> {
  return HttpClientRequest.get(`${cookout.url}${whoamiPath}`).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${token}`),
    HttpClientRequest.setHeader("cookout-harness", tool),
    HttpClient.execute,
    Effect.map((response) => response.status),
    Effect.orDie,
  );
}

const markerSets = [
  { markers: { CLAUDECODE: "1" }, shown: "CLAUDECODE=1", tool: "claude-code" },
  { markers: { AI_AGENT: "claude-code" }, shown: "AI_AGENT", tool: "claude-code" },
  { markers: { AI_AGENT: "claude-code_2-1-330_agent" }, shown: "AI_AGENT from Claude Code", tool: "claude-code" },
  { markers: { AI_AGENT: "opencode" }, shown: "AI_AGENT from opencode", tool: "opencode" },
  { markers: { AI_AGENT: "Some Tool!" }, shown: "AI_AGENT from another tool", tool: "some-tool" },
  {
    markers: { AI_AGENT: "Long Tool Long Tool Long Tool Long Tool Long Tool v2" },
    shown: "a long AI_AGENT",
    tool: "long-tool-long-tool-long-tool-long-tool",
  },
  { markers: { AI_AGENT: "!!!" }, shown: "an AI_AGENT with no letters or digits", tool: "unknown" },
  { markers: { CODEX_THREAD_ID: "019a-thread" }, shown: "CODEX_THREAD_ID", tool: "codex" },
  { markers: { CODEX_CI: "1" }, shown: "CODEX_CI=1", tool: "codex" },
  { markers: { CURSOR_AGENT: "1" }, shown: "CURSOR_AGENT", tool: "cursor" },
  { markers: { GEMINI_CLI: "1" }, shown: "GEMINI_CLI=1", tool: "gemini-cli" },
  { markers: { CLINE_ACTIVE: "true" }, shown: "CLINE_ACTIVE=true", tool: "cline" },
  { markers: { AI_AGENT: "opencode", OPENCODE: "1" }, shown: "OPENCODE=1 with AI_AGENT", tool: "opencode" },
] as const;

it.effect.each(markerSets)(
  "a human's COOKOUT_TOKEN where $shown is set is refused with 403 agent_as_human naming $tool",
  ({ markers, tool }) =>
    Effect.gen(function* humanFromAgent() {
      const cookout = yield* TestCookout;
      const ada = yield* cookout.createIdentity("ada", { kind: "human" });
      const client = createCookoutClient({ env: { ...envFor(cookout, ada.token), ...markers } });
      const error = yield* refusal(client.whoami);

      expect(error).toMatchObject({
        code: "agent_as_human",
        details: { harness: tool, identity: "ada" },
        status: FORBIDDEN,
      });
      expect(error.message).toContain("ada");
      expect(error.message).toContain(tool);
      expect(error.message).toContain("COOKOUT_ALLOW_HUMAN=1");
    }).pipe(Effect.provide(testCookout())),
);

it.effect("with COOKOUT_ALLOW_HUMAN=1, a human's token goes through from Claude Code and records no tool", () =>
  Effect.gen(function* allowHuman() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* answer(() => ada.client.createChannel({ name: "grill" }));
    const env = { ...envFor(cookout, ada.token), ...CLAUDE_CODE, COOKOUT_ALLOW_HUMAN: "1" };
    const client = createCookoutClient({ env });
    const { message } = yield* answer(() => client.createMessage({ channel: "grill", text: "me, on purpose" }));

    expect(message.author).toStrictEqual({ name: "ada" });
    expect(message).not.toHaveProperty("harness");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's token from Claude Code goes through, and the messages it posts record the tool", () =>
  Effect.gen(function* agentFromAgent() {
    const cookout = yield* TestCookout;
    const aide = yield* cookout.createIdentity("bot");
    yield* answer(() => aide.client.createChannel({ name: "grill" }));
    const client = createCookoutClient({ env: { ...envFor(cookout, aide.token), ...CLAUDE_CODE } });
    const { message: parent } = yield* answer(() => client.createMessage({ channel: "grill", text: "hello" }));
    yield* answer(() => client.createMessage({ channel: "grill", replyTo: parent.id, text: "again" }));
    yield* answer(() => aide.client.createMessage({ channel: "grill", replyTo: parent.id, text: "by hand" }));
    const thread = yield* answer(() => cookout.client.getThread(parent.id));

    expect(thread.parent.harness).toBe("claude-code");
    expect(Arr.map(thread.replies, (reply) => [reply.text, reply.harness ?? "none"])).toStrictEqual([
      ["again", "claude-code"],
      ["by hand", "none"],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a command call an agent makes from Claude Code records the tool on the call's message", () =>
  Effect.gen(function* callFromAgent() {
    const cookout = yield* TestCookout;
    yield* answer(() =>
      cookout.client.addCommand({ name: "deploy", schema: {}, url: `${cookout.webhook.url}/deploy` }),
    );
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const aide = yield* cookout.createIdentity("bot");
    const client = createCookoutClient({ env: { ...envFor(cookout, aide.token), ...CLAUDE_CODE } });
    const called = yield* answer(() => client.callCommand("deploy", { channel: "grill", data: {} }));
    const thread = yield* answer(() => cookout.client.getThread(called.threadId));

    expect(thread.parent).toMatchObject({ author: { name: "bot" }, harness: "claude-code" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human's token with no agent markers goes through", () =>
  Effect.gen(function* humanByHand() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const client = createCookoutClient({ env: envFor(cookout, ada.token) });
    const whoami = yield* answer(client.whoami);

    expect(whoami.identity).toMatchObject({ kind: "human", name: "ada" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human's token with an empty AI_AGENT and no other agent markers goes through", () =>
  Effect.gen(function* emptyAiAgent() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const client = createCookoutClient({ env: { ...envFor(cookout, ada.token), AI_AGENT: "", CLAUDECODE: "" } });
    const whoami = yield* answer(client.whoami);

    expect(whoami.identity).toMatchObject({ kind: "human", name: "ada" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a token given to the SDK, not read from COOKOUT_TOKEN, sends no harness unless it is given too", () =>
  Effect.gen(function* givenToken() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const given = createCookoutClient({ env: CLAUDE_CODE, token: ada.token, url: cookout.url });
    const named = createCookoutClient({ env: {}, harness: "claude-code", token: ada.token, url: cookout.url });
    const whoami = yield* answer(given.whoami);
    const error = yield* refusal(named.whoami);

    expect(whoami.identity).toMatchObject({ name: "ada" });
    expect(error).toMatchObject({ code: "agent_as_human", status: FORBIDDEN });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the server refuses the harness header with a human caller, takes it with an agent's, and checks it", () =>
  Effect.gen(function* serverGuard() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const aide = yield* cookout.createIdentity("bot");
    const statuses = yield* Effect.all(
      [
        whoamiWithTool(cookout, ada.token, "claude-code"),
        whoamiWithTool(cookout, aide.token, "claude-code"),
        whoamiWithTool(cookout, aide.token, "Not A Tool!"),
      ],
      ONE_AT_A_TIME,
    );

    expect(statuses).toStrictEqual([FORBIDDEN, OK, BAD_REQUEST]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);
