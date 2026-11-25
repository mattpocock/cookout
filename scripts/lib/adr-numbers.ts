import path from "node:path";

interface Numbered {
  readonly file: string;
  readonly number: number;
}

const WIDTH = 4;
const START = 0;
const ONE = 1;
const NUMBERED = new RegExp(String.raw`^\d{${WIDTH}}-.+\.md$`, "u");

function byNumber(left: Numbered, right: Numbered): number {
  return left.number - right.number;
}

function numbered(files: readonly string[]): readonly Numbered[] {
  return files
    .filter((file) => NUMBERED.test(path.basename(file)))
    .map((file): Numbered => ({ file, number: Number(path.basename(file).slice(START, WIDTH)) }))
    .toSorted(byNumber);
}

function padded(number: number): string {
  return String(number).padStart(WIDTH, "0");
}

function duplicateNumbers(files: readonly string[]): readonly string[] {
  const adrs = numbered(files);
  const numbers = [...new Set(adrs.map((adr) => adr.number))];
  return numbers.flatMap((number) => {
    const group = adrs.filter((adr) => adr.number === number).map((adr) => adr.file);
    if (group.length === ONE) {
      return [];
    }
    return [`${group.join(" and ")} share ADR number ${padded(number)}. Renumber one past the highest.`];
  });
}

export { duplicateNumbers };
