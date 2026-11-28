import { field, list, parseJson, text } from "./lib/json.ts";
import { linkIn, sessionFromLoginLink } from "./lib/login-link-session.ts";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { fail } from "./lib/tools.ts";
import { once } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";

type ServerProcess = ChildProcessByStdio<null, Readable, null>;

interface Server {
  readonly lines: readonly unknown[];
  readonly stop: () => Promise<number>;
  readonly url: string;
}

interface Started {
  readonly exited: Promise<number>;
  readonly stdout: Readable;
  readonly stop: () => Promise<number>;
}

interface RunFailure {
  readonly args: readonly string[];
  readonly command: string;
  readonly failure: string;
  readonly output: string;
}

const SCRIPT = "pack-smoke";
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const MAX_BUFFER = 67_108_864;
const root = mkdtempSync(path.join(tmpdir(), "cookout-pack-"));
const install = path.join(root, "install");
const database = path.join(root, "data", "cookout.db");
const bin = path.join(install, "node_modules", ".bin", "cookout");
const servers = new Set<ServerProcess>();

process.on("exit", () => {
  for (const server of servers) {
    server.kill("SIGKILL");
  }
  rmSync(root, { force: true, recursive: true });
});

function withEnv(variables: Readonly<Record<string, string>>, command: string, args: readonly string[]): string[] {
  return [
    ...Object.entries(variables).map(([name, value]: readonly [string, string]) => `${name}=${value}`),
    command,
    ...args,
  ];
}

function failRun({ args, command, failure, output }: RunFailure): void {
  fail(SCRIPT, `${command} ${args.join(" ")} failed (${failure}):\n${output}`);
}

function run(command: string, args: readonly string[], cwd = "."): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  const output = `${result.stdout}${result.stderr}`;
  if (result.error instanceof Error) {
    failRun({ args, command, failure: result.error.message, output });
  }
  if (result.status !== EXIT_SUCCESS) {
    failRun({ args, command, failure: `exit ${String(result.status)}`, output });
  }
  return result.stdout;
}

const secretsKey = run("openssl", ["rand", "-hex", "32"]).trim();
const AGENT = "pack-agent";
const CHANNEL = "pack";
const MESSAGE = "kept across a restart";

function check(ok: boolean, message: string): void {
  if (!ok) {
    fail(SCRIPT, message);
  }
  console.log(`ok   ${message}`);
}

async function closeCode(closing: Promise<readonly unknown[]>): Promise<number> {
  const [code] = await closing;
  if (typeof code === "number") {
    return code;
  }
  return EXIT_FAILURE;
}

function startServer(): Started {
  const args = withEnv({ COOKOUT_DB: database, COOKOUT_SECRETS_KEY: secretsKey }, bin, [
    "serve",
    "--port",
    "0",
    "--host",
    "127.0.0.1",
  ]);
  const child = spawn("env", args, { cwd: install, stdio: ["ignore", "pipe", "inherit"] });
  servers.add(child);
  const exited = closeCode(once(child, "close"));
  return {
    exited,
    stdout: child.stdout,
    stop: async (): Promise<number> => {
      child.kill("SIGTERM");
      const code = await exited;
      return code;
    },
  };
}

async function serve(): Promise<Server> {
  const { exited, stdout, stop } = startServer();
  const lines: unknown[] = [];
  for await (const line of createInterface({ input: stdout })) {
    const parsed = parseJson(line);
    lines.push(parsed);
    const url = text(field(parsed, "listening")) ?? "";
    if (url !== "") {
      return { lines, stop, url };
    }
  }
  return fail(
    SCRIPT,
    `cookout serve exited (${String(await exited)}) before listening. Output: ${JSON.stringify(lines)}`,
  );
}

function health(url: string): string {
  return run("curl", ["-fsS", `${url}/v1/health`]);
}

function webPage(url: string): string {
  return run("curl", ["-fsS", `${url}/`]);
}

function cli(url: string, token: string, args: readonly string[]): unknown {
  return parseJson(
    run("env", withEnv({ COOKOUT_ALLOW_HUMAN: "1", COOKOUT_TOKEN: token, COOKOUT_URL: url }, bin, args), install),
  );
}

function names(values: unknown, key: string, name: string): readonly unknown[] {
  return (list(field(values, key)) ?? []).map((value) => field(value, name));
}

function installTarball(): void {
  run("pnpm", ["run", "--silent", "build"]);
  run("pnpm", ["pack", "--pack-destination", root]);
  const tarball = readdirSync(root).find((file) => file.endsWith(".tgz")) ?? "";
  if (tarball === "") {
    fail(SCRIPT, `pnpm pack wrote no tarball to ${root}.`);
  }
  mkdirSync(path.join(root, "data"));
  mkdirSync(install);
  writeFileSync(path.join(install, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", path.resolve(root, tarball)], install);
}

function printsPackageVersion(): void {
  const printed = run(bin, ["--version"], install).trim();
  const packageJson = parseJson(readFileSync("package.json", "utf8"));
  const version = text(field(packageJson, "version")) ?? "";
  const expected = `cookout v${version}`;
  check(printed === expected, `the installed cookout --version prints ${expected} (it printed ${printed})`);
}

function refusesWithoutSecretsKey(): void {
  const args = withEnv({ COOKOUT_DB: database, COOKOUT_SECRETS_KEY: "" }, bin, ["serve", "--port", "0"]);
  const result = spawnSync("env", args, { cwd: install, encoding: "utf8" });
  check(
    result.status === EXIT_FAILURE && result.stderr.includes("secrets_key_invalid"),
    "cookout serve without COOKOUT_SECRETS_KEY refuses to start with secrets_key_invalid",
  );
}

function setupLinkOf(server: Server): string {
  return linkIn(server.lines.map((line) => JSON.stringify(line)));
}

function seed(url: string, adminSession: string): void {
  cli(url, adminSession, ["identity", "create", AGENT, "--kind", "agent", "--display-name", "Smoke agent"]);
  const agentToken = text(field(cli(url, adminSession, ["agent-key", "create", AGENT, "smoke"]), "token")) ?? "";
  check(agentToken !== "", `its owner admin's cookout agent-key create ${AGENT} answers with a token`);
  cli(url, adminSession, ["channel", "create", CHANNEL]);
  const posted = field(cli(url, agentToken, ["message", "post", CHANNEL, MESSAGE]), "message");
  check(field(posted, "text") === MESSAGE, `${AGENT} posts a message in #${CHANNEL}`);
}

async function boot(): Promise<string> {
  const first = await serve();
  const link = setupLinkOf(first);
  check(link !== "", "the first boot, with no COOKOUT_ADMIN_TOKEN, prints a setup link");
  const adminSession = await sessionFromLoginLink({ link, name: "admin", url: first.url });
  check(typeof parseJson(health(first.url)) === "object", `curl -fsS ${first.url}/v1/health succeeds`);
  check(webPage(first.url).includes('<div id="root">'), `curl -fsS ${first.url}/ answers with the built web UI`);
  seed(first.url, adminSession);
  check((await first.stop()) === EXIT_SUCCESS, "cookout serve exits 0 on SIGTERM");
  return adminSession;
}

async function restart(adminSession: string): Promise<void> {
  const second = await serve();
  check(setupLinkOf(second) === "", "a restart on the same COOKOUT_DB, which has an admin, prints no setup link");
  const answer = cli(second.url, adminSession, ["whoami"]);
  check(
    field(field(answer, "identity"), "name") === "admin",
    "after a restart, the session the setup link gave passes cookout whoami as admin",
  );
  const identities = names(cli(second.url, adminSession, ["identity", "list"]), "identities", "name");
  check(identities.includes(AGENT), `after a restart, cookout identity list still has ${AGENT}`);
  const messages = cli(second.url, adminSession, ["message", "list", CHANNEL]);
  const kept = (list(field(messages, "messages")) ?? []).some(
    (message) => field(message, "text") === MESSAGE && field(field(message, "author"), "name") === AGENT,
  );
  check(kept, `after a restart, cookout message list ${CHANNEL} reads back ${AGENT}'s message`);
  await second.stop();
}

function importSdk(): void {
  const keys = run(
    "node",
    ["-e", "import('@ai-hero/cookout/sdk').then(m => console.log(JSON.stringify(Object.keys(m))))"],
    install,
  );
  check(keys.includes("createCookoutClient"), `@ai-hero/cookout/sdk imports in Node with exports ${keys.trim()}`);
}

async function main(): Promise<void> {
  installTarball();
  printsPackageVersion();
  refusesWithoutSecretsKey();
  await restart(await boot());
  importSdk();
}

await main();
