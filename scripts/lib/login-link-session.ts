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
  readonly body: Readonly<Record<string, string>>;
  readonly kind: string;
  readonly path: string;
  readonly url: string;
}

const prefix = `${sessionCookieName}=`;

function sessionCookieOf(headers: Headers): string {
  const cookie = headers.getSetCookie().find((set) => set.startsWith(prefix)) ?? "";
  const [pair = ""] = cookie.split(";");
  return pair.slice(prefix.length);
}

async function sessionRedeemed({ body, kind, path, url }: Redemption): Promise<string> {
  const answer = await request({ baseUrl: url, body, method: "POST", path });
  const session = sessionCookieOf(answer.headers);
  if (session === "") {
    throw new Error(`the ${kind} gave no session: ${String(answer.status)} ${answer.text}`);
  }
  return session;
}

function redemptionOf({ link, name = "", url }: LinkRedeemed): Redemption {
  if (link.includes(setupLinkWebPath)) {
    const [, setupSecret = ""] = link.split(setupLinkWebPath);
    return { body: { name, secret: setupSecret }, kind: "setup link", path: redeemSetupLinkPath, url };
  }
  const [, secret = ""] = link.split(loginLinkWebPath);
  return { body: { secret }, kind: "login link", path: redeemLoginLinkPath, url };
}

async function sessionFromLink(redeemed: LinkRedeemed): Promise<string> {
  const session = await sessionRedeemed(redemptionOf(redeemed));
  return session;
}

export { sessionFromLink };
