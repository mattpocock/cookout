import { createContext, useContext } from "react";
import type { Scheduling } from "../../board/index.ts";

const SchedulingContext = createContext<Scheduling | null>(null);

function useScheduling(): Scheduling {
  const scheduling = useContext(SchedulingContext);
  if (scheduling === null) {
    throw new TypeError("A reply box is drawn outside ScheduleLists, which holds the scheduling store");
  }
  return scheduling;
}

export { SchedulingContext, useScheduling };
