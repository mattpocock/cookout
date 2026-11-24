import type { SetTriggerRequest, Trigger, TriggerHeader, TriggerResponse } from "../../index.ts";
import { Schema } from "effect";
import { TriggerResultSchema } from "../../../presence/server.ts";
import { matchesWire } from "../../../http/index.ts";

const HeaderNamesSchema = Schema.Array(Schema.String);

const TriggerSchema = matchesWire<Trigger>()(
  Schema.Struct({
    headerNames: Schema.optionalKey(HeaderNamesSchema),
    lastResult: Schema.optionalKey(TriggerResultSchema),
    url: Schema.String,
  }),
);

const TriggerHeaderSchema = matchesWire<TriggerHeader>()(Schema.Struct({ name: Schema.String, value: Schema.String }));

const TriggerHeadersSchema = Schema.Array(TriggerHeaderSchema);

export const TriggerResponseSchema = matchesWire<TriggerResponse>()(
  Schema.Struct({ trigger: Schema.NullOr(TriggerSchema) }),
);

export const SetTriggerRequestSchema = matchesWire<SetTriggerRequest>()(
  Schema.Struct({
    headers: Schema.optionalKey(TriggerHeadersSchema),
    token: Schema.String,
    url: Schema.String,
  }),
);
