import { Array as Arr, Option, String as Str } from "effect";

type Marks = readonly (readonly [string, string])[];

const BROWSERS: Marks = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
];

const SYSTEMS: Marks = [
  ["Android", "Android"],
  ["iPhone", "iOS"],
  ["iPad", "iOS"],
  ["CrOS", "ChromeOS"],
  ["Windows", "Windows"],
  ["Mac OS X", "macOS"],
  ["Linux", "Linux"],
];

const UNNAMED = "web browser";

function named(userAgent: string, marks: Marks): Option.Option<string> {
  return Option.map(
    Arr.findFirst(marks, ([mark]) => Str.includes(mark)(userAgent)),
    ([, name]) => name,
  );
}

function webSessionWhere(userAgent = ""): string {
  return Option.getOrElse(
    Option.zipWith(
      named(userAgent, BROWSERS),
      named(userAgent, SYSTEMS),
      (browser, system) => `${browser} on ${system}`,
    ),
    () => UNNAMED,
  );
}

export { webSessionWhere };
