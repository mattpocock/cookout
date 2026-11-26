type Fields = Readonly<object>;

function entriesOf(fields: Fields): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>(Object.entries(fields));
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function sameFields(one: Fields, other: Fields): boolean {
  const before = entriesOf(one);
  const after = entriesOf(other);
  return before.size === after.size && [...before.keys()].every((key) => Object.is(before.get(key), after.get(key)));
}

function sameField(one: unknown, other: unknown): boolean {
  if (isFields(one) && isFields(other)) {
    return sameFields(one, other);
  }
  return Object.is(one, other);
}

export function sameProps<Props extends Fields>(rebuilt: keyof Props): (before: Props, after: Props) => boolean {
  return (before, after) =>
    sameField(before[rebuilt], after[rebuilt]) &&
    sameFields({ ...before, [rebuilt]: null }, { ...after, [rebuilt]: null });
}
