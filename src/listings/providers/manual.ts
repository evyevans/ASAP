/* ═══════════════════════════════════════════════════════════════════════════
   manual — the realtor types it in.

   The least glamorous provider and the most important one on day one. It is
   the only source that works with no credentials, no licence and no network,
   which makes it the thing that lets a realtor use Market Scout and the match
   grid the hour after this ships rather than the quarter after.

   It is also the only source whose output is shareable by default: the person
   entering it is the licensed professional, and they are entitled to send a
   buyer a listing they looked up themselves.

   `fetch` is a deliberate no-op. Manual entries arrive through the UI and go
   straight into asap_listings; there is nothing to poll. Returning an honest
   empty result rather than throwing keeps it a first-class provider in the
   registry — it appears in "where should I look?" lists, and its rights and
   confidence flow through normalizeListing exactly like every other source.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ListingProvider, FetchParams, FetchResult } from '../provider';
import { MANUAL_RIGHTS } from '../provider';

export const manualProvider: ListingProvider = {
  id: 'manual',
  label: 'Entered by you',
  rights: MANUAL_RIGHTS,

  isConfigured: () => true,

  async fetch(params: FetchParams): Promise<FetchResult> {
    void params;
    return {
      ok: true,
      listings: [],
      reason: 'Manual entries are added from the Scout screen, not fetched.',
      sourceId: 'manual',
      fetchedAt: new Date().toISOString(),
    };
  },
};
