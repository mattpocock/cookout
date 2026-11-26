import { DateTime, Option } from "effect";
import type { RedV1State, V1Run } from "./lib/red-v1.ts";
import { appendFileSync } from "node:fs";
import { applyRedV1 } from "./lib/red-v1-apply.ts";
import { fail } from "./lib/tools.ts";
import { parseArgs } from "node:util";
import { readRedV1 } from "./lib/red-v1-read.ts";
import { redV1Decision } from "./lib/red-v1.ts";

const SCRIPT = "red-v1";
const RERUN = 2;
const NONE = 0;

const { values } = parseArgs({
  options: {
    "assume-reruns-fail": { type: "boolean" },
    at: { type: "string" },
    "dry-run": { type: "boolean" },
    summary: { type: "string" },
  },
});

const dryRun = values["dry-run"] === true;
const at = values.at ?? null;
const lines: string[] = [];

function log(line: string): void {
  lines.push(line);
  console.log(`${SCRIPT}: ${line}`);
}

function nowMillis(): number {
  if (at === null) {
    return DateTime.toEpochMillis(DateTime.nowUnsafe());
  }
  return Option.match(DateTime.make(at), {
    onNone: () => fail(SCRIPT, `--at ${at} is not a time`),
    onSome: DateTime.toEpochMillis,
  });
}

function rerunFailed(run: V1Run): V1Run {
  if (run.conclusion !== "failure") {
    return run;
  }
  return { ...run, attempt: Math.max(run.attempt, RERUN) };
}

function assumed(state: RedV1State): RedV1State {
  if (values["assume-reruns-fail"] !== true) {
    return state;
  }
  if (!dryRun) {
    return fail(SCRIPT, "--assume-reruns-fail only goes with --dry-run");
  }
  return { ...state, runs: state.runs.map((run) => rerunFailed(run)) };
}

const seams = { cwd: process.cwd(), gh: ["gh"], git: ["git"] };
const read = readRedV1({ ...seams, at, nowMillis: nowMillis() });
if (read.ok) {
  const decided = redV1Decision(assumed(read.value.state));
  for (const line of decided.lines) {
    log(line);
  }
  if (decided.actions.length === NONE && decided.lines.length === NONE) {
    log("nothing to do: v1 is green, or its red run is waiting for its rerun");
  }
  const applying = { ...seams, commits: read.value.commits, dryRun, log };
  const applied = applyRedV1({ actions: decided.actions, applying });
  if (typeof values.summary === "string" && values.summary !== "") {
    appendFileSync(values.summary, `### Red v1\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  }
  if (!applied.ok) {
    fail(SCRIPT, applied.reason);
  }
} else {
  fail(SCRIPT, read.reason);
}
