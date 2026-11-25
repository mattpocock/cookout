import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { flakyArguments, flakyReport } from "./lib/browser-flaky.ts";
import { parseJson } from "./lib/json.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const FIRST_ARGUMENT = 2;
const EXIT_FAILURE = 1;

const parsed = flakyArguments(process.argv.slice(FIRST_ARGUMENT));

function reportIn(output: string): unknown {
  if (!existsSync(output)) {
    return null;
  }
  return parseJson(readFileSync(output, "utf8"));
}

function run(file: string, repeats: number): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), "browser-flaky-"));
  const output = path.join(dir, "report.json");
  const repeat = `--repeat-each=${String(repeats)}`;
  spawnSync(
    "env",
    [
      `PLAYWRIGHT_JSON_OUTPUT_FILE=${output}`,
      "pnpm",
      "exec",
      "playwright",
      "test",
      file,
      repeat,
      "--retries=0",
      "--reporter=dot,json",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const report = reportIn(output);
  rmSync(dir, { force: true, recursive: true });
  const { lines, ok } = flakyReport(report);
  console.log(lines.join("\n"));
  return ok;
}

if (!parsed.ok) {
  console.error("usage: pnpm browser:flaky <file> [repeats, default 25]");
  console.log("RESULT: FAIL (usage)");
  process.exitCode = EXIT_FAILURE;
} else if (!run(parsed.file, parsed.repeats)) {
  process.exitCode = EXIT_FAILURE;
}
