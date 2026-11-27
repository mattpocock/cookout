import type { LoginAlert } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { inPane } from "./regions.ts";
import { sessionCookieName } from "../../../identities/index.ts";

interface LogIn {
  readonly page: Page;
  readonly token: string;
  readonly url?: string;
  readonly waitUntil?: "commit" | "load";
}

const SESSION_PATH = "/v1/session";
const INBOX_PATH = "/v1/inbox";
const STREAM_PATH = "/v1/events";

function isLoginAlert(alert: unknown): alert is LoginAlert {
  return typeof alert === "object" && alert !== null && "login" in alert;
}

function loginAlertsIn(inbox: unknown): readonly LoginAlert[] {
  if (typeof inbox !== "object" || inbox === null || !("alerts" in inbox) || !Array.isArray(inbox.alerts)) {
    return [];
  }
  return inbox.alerts.filter((alert) => isLoginAlert(alert));
}

async function loginAlertsRead({ page, token }: LogIn): Promise<void> {
  const headers = { authorization: `Bearer ${token}` };
  const response = await page.request.get(INBOX_PATH, { headers });
  const inbox: unknown = await response.json();
  await Promise.all(
    loginAlertsIn(inbox).map(async ({ id }) => {
      await page.request.post(`${INBOX_PATH}/alerts/${String(id)}/read`, { headers });
    }),
  );
}

export async function logInThroughForm({ page, token, url = "/" }: LogIn): Promise<void> {
  await page.goto(url);
  await page.getByLabel("Token", { exact: true }).fill(token);
  await inPane(page).getByRole("button", { exact: true, name: "Log in" }).click();
}

export async function logIn({ page, token, url = "/", waitUntil = "load" }: LogIn): Promise<void> {
  const response = await page.request.post(SESSION_PATH, { headers: { authorization: `Bearer ${token}` } });

  expect(response.ok(), await response.text()).toBe(true);

  await loginAlertsRead({ page, token });
  await page.goto(url, { waitUntil });
}

export async function logInToChannels(login: LogIn): Promise<void> {
  await logIn(login);

  await expect(login.page.getByRole("list", { exact: true, name: "Channels" })).toBeAttached();
}

export async function logInWithStream(login: LogIn): Promise<void> {
  const streamOpen = login.page.waitForResponse((response) => response.url().includes(STREAM_PATH));
  await logIn(login);
  await streamOpen;
}

export async function logInThroughFormWithStream(login: LogIn): Promise<void> {
  const streamOpen = login.page.waitForResponse((response) => response.url().includes(STREAM_PATH));
  await logInThroughForm(login);
  await streamOpen;
}

export async function sessionTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  for (const { name, value } of cookies) {
    if (name === sessionCookieName) {
      return value;
    }
  }
  return "";
}

export type { LogIn };
