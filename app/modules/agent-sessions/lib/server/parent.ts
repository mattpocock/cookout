import { Effect, Option } from "effect";
import { CredentialSent } from "../../../identities/server.ts";
import type { TokenHash } from "../../../identities/index.ts";

export function withParent<Made extends object>(made: Made): Effect.Effect<Made & { readonly parent?: TokenHash }> {
  return Effect.map(CredentialSent, Option.match({ onNone: () => made, onSome: (parent) => ({ ...made, parent }) }));
}
