import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import { browserShardPlan } from "../lib/timed-shards.ts";
import path from "node:path";

const DIR = "app/modules/routes/tests/browser";
const RUN = "900";
const RECORDED_RUN = 800;
const ASKED_AT = "2026-11-25T10:00:00Z";
const EARLIER = "2026-11-25T09:00:00Z";
const ARTIFACT = "test-timings-browser-1";
const MS = 1000;
const LAST = -1;
const BUSY = "gh run download failed: HTTP 503: No server is currently available";
const MISSING = "gh run download failed: HTTP 404: Not Found";
const UNSPLIT = "can't read the recorded timings, and a split of its own would differ from the other shards'";
const ALWAYS = Number.POSITIVE_INFINITY;
const TWICE = 2;
const ONE = 1;
const THREE = 3;
const FIVE_SECONDS = 5000;
const ALPHA_SECONDS = 50;
const BRAVO_SECONDS = 40;

function file(name: string): string {
  return `${DIR}/${name}.browser.test.ts`;
}

const FILES = { ok: true, value: [file("alpha"), file("bravo")] } as const;

function report(): string {
  const suites = Object.entries({ alpha: ALPHA_SECONDS, bravo: BRAVO_SECONDS }).map(
    ([name, took]: readonly [string, number]) => ({
      file: `${name}.browser.test.ts`,
      specs: [{ tests: [{ results: [{ duration: took * MS }] }] }],
    }),
  );
  return JSON.stringify({ suites });
}

function api(target: string): Outcome<string> {
  if (target.endsWith(`/runs/${RUN}`)) {
    return { ok: true, value: JSON.stringify({ created_at: ASKED_AT, id: Number(RUN) }) };
  }
  const artifact = { created_at: EARLIER, expired: false, name: ARTIFACT, workflow_run: { id: RECORDED_RUN } };
  return { ok: true, value: JSON.stringify({ artifacts: [artifact] }) };
}

function download(args: readonly string[]): Outcome<string> {
  const dir = path.join(args.at(LAST) ?? "", ".timings");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "browser.json"), report());
  return { ok: true, value: "" };
}

interface Flaky {
  readonly attempts: () => number;
  readonly gh: (args: readonly string[]) => Outcome<string>;
}

function failingDownload(reason: string, failures: number): Flaky {
  let attempts = 0;
  return {
    attempts: () => attempts,
    gh: (args) => {
      const [verb, target = ""] = args;
      if (verb !== "run") {
        return api(target);
      }
      attempts += ONE;
      if (attempts <= failures) {
        return { ok: false, reason };
      }
      return download(args);
    },
  };
}

interface Waits {
  readonly sleep: (ms: number) => void;
  readonly waits: readonly number[];
}

function recordedWaits(): Waits {
  const waits: number[] = [];
  return {
    sleep: (ms) => {
      waits.push(ms);
    },
    waits,
  };
}

it("a CI shard retries the timings download after a 5xx, 5 s apart, and runs with the recorded times", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { attempts, gh } = failingDownload(BUSY, TWICE);
  const { sleep, waits } = recordedWaits();

  expect([browserShardPlan({ files: FILES, gh, run: RUN, shard: "1/2", sleep }), attempts(), waits]).toStrictEqual([
    {
      args: ["--record-shard=1/2", file("alpha")],
      failure: "",
      line: "browser shard 1/2: 1 of 2 files, 50.0s of test time as run 800 recorded it",
    },
    THREE,
    [FIVE_SECONDS, FIVE_SECONDS],
  ]);
});

it("a CI shard whose timings download answers 5xx every time fails after 3 attempts, saying so", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const { attempts, gh } = failingDownload(BUSY, ALWAYS);
  const { sleep, waits } = recordedWaits();

  expect([browserShardPlan({ files: FILES, gh, run: RUN, shard: "2/2", sleep }), attempts(), waits]).toStrictEqual([
    { args: [], failure: `browser shard 2/2 ${UNSPLIT}: ${BUSY} (gave up after 3 attempts)`, line: "" },
    THREE,
    [FIVE_SECONDS, FIVE_SECONDS],
  ]);
});

it("a CI shard whose timings download answers 4xx fails at once", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const { attempts, gh } = failingDownload(MISSING, ALWAYS);
  const { sleep, waits } = recordedWaits();

  expect([browserShardPlan({ files: FILES, gh, run: RUN, shard: "2/2", sleep }), attempts(), waits]).toStrictEqual([
    { args: [], failure: `browser shard 2/2 ${UNSPLIT}: ${MISSING}`, line: "" },
    ONE,
    [],
  ]);
});
