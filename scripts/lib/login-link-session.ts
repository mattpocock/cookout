import { loginLinkWebPath, redeemLoginLinkPath } from "../../app/modules/logins/index.ts";
import { request } from "../../app/modules/http/client.ts";
import { sessionCookieName } from "../../app/modules/identities/index.ts";

interface LoginLinkRedeemed {
  readonly link: string;
  readonly url: string;
}

const prefix = `${sessionCookieName}=`;

function sessionCookieOf(headers: Headers): string {
  const cookie = headers.getSetCookie().find((set) => set.startsWith(prefix)) ?? "";
  const [pair = ""] = cookie.split(";");
  return pair.slice(prefix.length);
}

async function sessionFromLoginLink({ link, url }: LoginLinkRedeemed): Promise<string> {
  const [, secret = ""] = link.split(loginLinkWebPath);
  const answer = await request({ baseUrl: url, body: { secret }, method: "POST", path: redeemLoginLinkPath });
  const session = sessionCookieOf(answer.headers);
  if (session === "") {
    throw new Error(`the login link gave no session: ${String(answer.status)} ${answer.text}`);
  }
  return session;
}

export { sessionFromLoginLink };
