import { createInterface } from "node:readline";
import { once } from "node:events";
import { sessionFromLink } from "./lib/login-link-session.ts";
import { spawn } from "node:child_process";
import { webBuild } from "./lib/web-build.ts";

const PRESENCE_GRACE_SECONDS = "2";

interface DevCookout {
  readonly loginLink: string;
  readonly relayUrl: string;
  readonly webUrl: string;
}

function fieldsOf(line: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(line);
    return Object.fromEntries(Object.entries(parsed ?? {}));
  } catch {
    return {};
  }
}

function devCookoutIn(line: string): DevCookout | null {
  const { loginLink, relayUrl, webUrl } = fieldsOf(line);
  const urls = typeof relayUrl === "string" && typeof webUrl === "string";
  if (typeof loginLink === "string" && urls) {
    return { loginLink, relayUrl, webUrl };
  }
  return null;
}

async function startLine(lines: AsyncIterable<string>): Promise<DevCookout> {
  for await (const line of lines) {
    const cookout = devCookoutIn(line);
    if (cookout !== null) {
      return cookout;
    }
  }
  throw new Error("app/dev.ts start stopped before printing its start line");
}

async function builtWebFolder(): Promise<string> {
  const probe = process.env["COOKOUT_BROWSER_PROBE"] === "1";
  const web = await webBuild({ probe, root: process.cwd() });
  if (web.built) {
    console.error(`browser-test-server: built the web UI into ${web.folder}`);
  }
  return web.folder;
}

async function setup(): Promise<() => Promise<void>> {
  const web = await builtWebFolder();
  const dev = spawn(process.execPath, ["app/dev.ts", "start", "--web", web], {
    env: { ...process.env, COOKOUT_PRESENCE_GRACE_SECONDS: PRESENCE_GRACE_SECONDS },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const cookout = await startLine(createInterface({ input: dev.stdout }));
  process.env["COOKOUT_TOKEN"] = await sessionFromLink({ link: cookout.loginLink, url: cookout.webUrl });
  process.env["COOKOUT_URL"] = cookout.webUrl;
  process.env["COOKOUT_ALLOW_HUMAN"] = "1";
  process.env["COOKOUT_RELAY_URL"] = cookout.relayUrl;
  process.env["COOKOUT_WEB_FOLDER"] = web;
  return async () => {
    dev.kill("SIGINT");
    await once(dev, "exit");
  };
}

export default setup;
