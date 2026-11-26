import { PANEL, builtScript, webProject, writeFile } from "./lib/web-project.ts";
import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import { webBuild } from "../lib/web-build.ts";

const NOT_FOUND = -1;

it("builds the web UI once and reuses the build while the web sources are unchanged", { timeout: 20_000 }, async () => {
  expect.hasAssertions();

  const root = webProject();
  const first = await webBuild({ probe: false, root });
  const second = await webBuild({ probe: false, root });

  expect([first.built, second.built]).toStrictEqual([true, false]);
  expect(second.folder).toBe(first.folder);
  expect(builtScript(first.folder).text).toContain("app-ran");
});

it("builds again when a web source changes, and keeps only the newest build", { timeout: 20_000 }, async () => {
  expect.hasAssertions();

  const root = webProject();
  const first = await webBuild({ probe: false, root });
  const text = 'export function shown() {\n  return "changed-panel";\n}\nexport function hidden() {}\n';
  writeFile({ file: PANEL, root, text });
  const changed = await webBuild({ probe: false, root });

  expect(changed.built).toBe(true);
  expect(changed.folder).not.toBe(first.folder);
  expect(existsSync(first.folder)).toBe(false);
  expect(builtScript(changed.folder).text).toContain("changed-panel");
});

it("reuses the build when only a test file changes", { timeout: 20_000 }, async () => {
  expect.hasAssertions();

  const root = webProject();
  const first = await webBuild({ probe: false, root });
  writeFile({ file: "app/modules/views/tests/panel.test.ts", root, text: "export const CHANGED = true;\n" });
  const again = await webBuild({ probe: false, root });

  expect(again).toStrictEqual({ built: false, folder: first.folder });
});

it("with the probe, the build runs the probe's script ahead of the app's, and without it leaves the probe out", {
  timeout: 20_000,
}, async () => {
  expect.hasAssertions();

  const root = webProject();
  const withProbe = await webBuild({ probe: true, root });
  const withoutProbe = await webBuild({ probe: false, root });
  const probed = builtScript(withProbe.folder).text;
  const plain = builtScript(withoutProbe.folder).text;

  expect(probed.indexOf("probe-ran")).toBeGreaterThan(NOT_FOUND);
  expect(probed.indexOf("probe-ran")).toBeLessThan(probed.indexOf("app-ran"));
  expect(plain).not.toContain("probe-ran");
});
