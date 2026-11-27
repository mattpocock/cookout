import { createContext } from "react";

type Announce = (text: string) => unknown;

const UNHEARD: Announce = Boolean;

const AnnounceContext = createContext<Announce>(UNHEARD);

export { type Announce, AnnounceContext };
