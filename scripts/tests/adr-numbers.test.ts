import { expect, it } from "vitest";
import { duplicateNumbers } from "../lib/adr-numbers.ts";

it("names two ADRs that share a number", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const duplicates = duplicateNumbers([
    "docs/adr/0032-the-admin-token.md",
    "docs/adr/0033-limits.md",
    "docs/adr/0033-the-hook.md",
    "docs/adr/README.md",
  ]);

  expect(duplicates).toStrictEqual([
    "docs/adr/0033-limits.md and docs/adr/0033-the-hook.md share ADR number 0033. Renumber one past the highest.",
  ]);
});

it("passes ADRs that each have their own number", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(duplicateNumbers(["docs/adr/0033-limits.md", "docs/adr/0034-the-hook.md"])).toStrictEqual([]);
});
