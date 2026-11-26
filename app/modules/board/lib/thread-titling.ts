import type { TopLevelMessage } from "../../sdk/index.ts";

interface Titled {
  readonly message: TopLevelMessage;
  readonly parent: TopLevelMessage;
}

function titledAs({ message, parent }: Titled): TopLevelMessage {
  const { title: _title, titleSetAt: _titleSetAt, titleSetBy: _titleSetBy, ...untitled } = message;
  const { title, titleSetAt, titleSetBy } = parent;
  return {
    ...untitled,
    ...(typeof title === "string" && { title }),
    ...(typeof titleSetAt === "string" && { titleSetAt }),
    ...(typeof titleSetBy === "string" && { titleSetBy }),
  };
}

export { titledAs };
