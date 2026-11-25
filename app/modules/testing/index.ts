/**
 * What tests running in another process from the cookout need, with no test runner in it, so the browser tests
 * and `pnpm screenshots` can import it too. `moveClockForward({ clockUrl, days })` moves the dev program's
 * adjustable clock, at the `clockUrl` that `pnpm dev` prints, that many days forward, so a job waiting days
 * (the nudge job) runs as if they had passed. `serve` has no such clock. `uniqueName({ name, run })` suffixes
 * `name` with one run of a test (`run` is its Playwright `TestInfo`), so the channels and identities a browser test
 * makes never clash with its own repeats under `--repeat-each` or its retries; the browser tests reach it as
 * `unique(name)` from their `names.ts`. `hillsPng()` is a real 480 by 320 PNG, for a test or a screen that shows
 * an image attachment.
 */
export { type ClockForward, moveClockForward } from "./lib/clock.ts";
export { hillsPng } from "./lib/hills.ts";
export { type TestRun, uniqueName } from "./lib/unique-name.ts";
