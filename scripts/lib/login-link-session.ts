import { loginLinkWebPath, redeemLoginLinkPath } from "../../app/modules/logins/index.ts";
import { redeemSetupLinkPath, setupLinkWebPath } from "../../app/modules/logins/setup-links.ts";
import { request } from "../../app/modules/http/client.ts";
import { sessionCookieName } from "../../app/modules/identities/index.ts";

interface LinkRedeemed {
  readonly link: string;
  readonly url: string;
  readonly name?: string;
}

interface Redemption {
  readonly path: string;
  readonly body: object;
}

const prefix = `${sessionCookieName}=`;
const linkFields = ["setupLink", "loginLink"];

function sessionCookieOf(headers: Headers): string {
  const cookie = headers.getSetCookie().find((set) => set.startsWith(prefix)) ?? "";
  const [pair = ""] = cookie.split(";");
  return pair.slice(prefix.length);
}

function redemptionOf({ link, name = "" }: LinkRedeemed): Redemption {
  if (link.includes(setupLinkWebPath)) {
    const [, secret = ""] = link.split(setupLinkWebPath);
    return { body: { name, secret }, path: redeemSetupLinkPath };
  }
  const [, secret = ""] = link.split(loginLinkWebPath);
  return { body: { secret }, path: redeemLoginLinkPath };
}

function linkOf(line: string): string {
  try {
    const parsed: unknown = JSON.parse(line);
    const fields = new Map<string, unknown>(Object.entries(parsed ?? {}));
    const values = linkFields.map((field) => fields.get(field));
    return values.find((value): value is string => typeof value === "string") ?? "";
  } catch {
    return "";
  }
}

function linkIn(lines: readonly string[]): string {
  return lines.map((line) => linkOf(line)).find((link) => link !== "") ?? "";
}

async function sessionFromLoginLink(redeemed: LinkRedeemed): Promise<string> {
  const { body, path } = redemptionOf(redeemed);
  const answer = await request({ baseUrl: redeemed.url, body, method: "POST", path });
  const session = sessionCookieOf(answer.headers);
  if (session === "") {
    throw new Error(`the link gave no session: ${String(answer.status)} ${answer.text}`);
  }
  return session;
}

export { linkIn, sessionFromLoginLink };
