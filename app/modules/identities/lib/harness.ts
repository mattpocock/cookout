declare const brand: unique symbol;

export type Harness = string & { readonly [brand]: "Harness" };

export const harnessPattern = /^[a-z0-9-]{1,40}$/u;

export function isHarness(value: string): value is Harness {
  return harnessPattern.test(value);
}

export const harnessHeader = "cookout-harness";
