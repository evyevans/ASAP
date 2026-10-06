/* ═══════════════════════════════════════════════════════════════════════════
   webResearch — what Hermes finds on public listing pages.

   HOW THIS ACTUALLY WORKS, AND WHY THE BROWSER DOES NOT DO IT
   asap-buyer-match.md:18 already describes the behaviour: Hermes reads public
   Realtor.ca / HouseSigma pages with web_search and browser, and treats what it
   finds as "public snapshots the agent must confirm live on MLS."

   The browser cannot do that itself — CORS blocks it, and scraping from a
   realtor's own browser session would be both fragile and rude. So this
   provider does not scrape. It reads what Hermes has already written into
   asap_listings for this market. The agent is the fetcher; this is the read
   side of that arrangement.

   That split is deliberate. It means:
     · rate limiting, retries and politeness live in one place (the agent)
     · the browser never holds a scraping credential
     · every row is written once, with provenance, and read many times

   WHAT ITS DATA IS AND IS NOT
   `public_snapshot`, never `confirmed`. A price read from a public page can be
   hours stale and the listing may already be conditional. It is good enough to
   decide "is this worth showing my buyer", which is exactly the decision the
   match engine makes, and not good enough to send onward as fact — hence
   canShareWithClient: false. Every surface that renders one of these rows shows
   the provenance line alongside it.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { ListingProvider, FetchParams, FetchResult } from '../provider';
import { PUBLIC_RESEARCH_RIGHTS } from '../provider';

export const webResearchProvider: ListingProvider = {
  id: 'web_research',
  label: 'Public listing research',
  rights: PUBLIC_RESEARCH_RIGHTS,

  // Always available: it needs no credential, because the agent that populates
  // it runs elsewhere.
  isConfigured: () => true,

  async fetch(params: FetchParams): Promise<FetchResult> {
    void params;
    return {
      ok: true,
      listings: [],
      reason:
        'Public research is gathered by ASAP and written to your listings directly. ' +
        'Ask it to search a market, or add a listing yourself.',
      sourceId: 'web_research',
      fetchedAt: new Date().toISOString(),
    };
  },
};
