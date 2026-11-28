import { keepAdminSession, startWebTestCookout } from "./web-test-server.ts";
import type { Environment } from "vitest/runtime";
import { builtinEnvironments } from "vitest/runtime";

const { jsdom } = builtinEnvironments;

const webTestEnvironment: Environment = {
  ...jsdom,
  name: "jsdom-cookout",
  setup: async (global: unknown, options: Readonly<Record<string, unknown>>) => {
    const cookout = await startWebTestCookout();
    const page = await jsdom.setup(global, { ...options, jsdom: { url: cookout.url } });
    keepAdminSession(cookout.adminSession);
    return {
      teardown: async (done: unknown) => {
        await page.teardown(done);
        await cookout.stop();
      },
    };
  },
};

export default webTestEnvironment;
