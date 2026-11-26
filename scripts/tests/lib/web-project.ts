import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PANEL = "app/modules/views/lib/panel.ts";
const PANEL_LINES = [
  'const TITLE = "Panel";',
  "",
  "export function shown() {",
  "  const title = TITLE;",
  "  return title;",
  "}",
  "",
  "export function hidden() {",
  '  const words = ["never", "rendered"];',
  '  return words.join(" ");',
  "}",
  "",
];
const FILES: Readonly<Record<string, string>> = {
  "app/modules/probe/web.ts": 'document.body.dataset["probe"] = "probe-ran";\n',
  "app/modules/views/lib/panel.ts": PANEL_LINES.join("\n"),
  "app/modules/views/tests/panel.test.ts": "export const NOT_BUILT = true;\n",
  "app/web.ts": [
    `import { hidden, shown } from "./modules/views/lib/panel.ts";`,
    "",
    'document.title = "app-ran " + shown();',
    'Reflect.set(globalThis, "hidden", hidden);',
    "",
  ].join("\n"),
  "index.html":
    '<!doctype html><html><head><title>web</title></head><body><script type="module" src="/app/web.ts"></script></body></html>\n',
};

interface Written {
  readonly file: string;
  readonly root: string;
  readonly text: string;
}

function writeFile({ file, root, text }: Written): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function webProject(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cookout-web-project-"));
  for (const [file, text] of Object.entries(FILES)) {
    writeFile({ file, root, text });
  }
  return root;
}

function builtScript(folder: string): { readonly name: string; readonly text: string } {
  const assets = path.join(folder, "assets");
  const name = readdirSync(assets).find((file) => file.endsWith(".js")) ?? "";
  return { name, text: readFileSync(path.join(assets, name), "utf8") };
}

export { PANEL, PANEL_LINES, builtScript, webProject, writeFile };
