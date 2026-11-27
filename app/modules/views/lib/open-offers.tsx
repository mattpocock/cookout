import type { DeactivationOffer, DeactivationOfferId } from "../../sdk/index.ts";
import { createAskedRows, shownWith } from "./asked-rows.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { DeactivationOffers } from "../../unread/index.ts";
import type { Identities } from "../../composer/index.ts";
import { OpenOfferRow } from "./open-offer-row.tsx";
import type { ReactNode } from "react";

interface OpenOffersProps {
  readonly offers: readonly DeactivationOffer[];
  readonly deactivationOffers: Pick<DeactivationOffers, "keep">;
  readonly identities: Pick<Identities, "actions">;
}

export function OpenOffers(props: OpenOffersProps): ReactNode {
  const asking = useMemo(() => createAskedRows<DeactivationOfferId, DeactivationOffer>(), []);
  const asked = useSyncExternalStore(asking.subscribe, asking.snapshot);
  return shownWith({ asked, entries: props.offers }).map((offer) => (
    <OpenOfferRow
      asking={asking}
      identities={props.identities}
      key={`offer ${String(offer.id)}`}
      offer={offer}
      offers={props.deactivationOffers}
    />
  ));
}
