/** Fictional scenario only. No records or credentials are copied from a live account. */
import type { Client, Criterion, ClientGeography, Listing, MarketRow } from '../matching/types';
import type { CalendarEvent, CalendarRow } from '../calendar/types';
import type { ExecutionLogRow, WeeklyExecutionRow } from '../analytics/executionTypes';
import type { AgentEventRow } from '../analytics/agentEventTypes';
import type { FubPerson, FubPersonDetail } from '../hooks/useFubPeople';
import type { AlertRow, AlertPrefs, MandateRow, TaskLedgerRow } from '../analytics/tabTypes';

export const DEMO_ORG = 'demo-org';
export const DEMO_USER = 'demo-realtor';
export const STORE_KEY = 'asap-showcase-v2';
export const CHAT_KEY = 'asap-showcase-chat-v1';
export const clone = <T,>(value: T): T => structuredClone(value);
export const PACKET = `BUYER PREPARATION · FICTIONAL SAMPLE\n\nSarah Chen · East Toronto · up to $1,100,000\nMust have: 3 bedrooms, 2 bathrooms, parking. Prefers a detached home.\n\n1. 18 Sample Lane — $995,000, 3 beds, 2 baths, 1 parking space. Semi-detached; meets the requirements, with a property-type tradeoff.\n2. 42 Example Avenue — $1,075,000, 4 beds, 2 baths, 2 parking spaces. Detached; the stronger fit to Sarah’s stated brief.\n\nBefore the showing: confirm availability and disclosures, ask Sarah to rank outdoor space against commute time, and review the pre-approval expiry.\n\nSuggested follow-up: “Sarah, I’ve prepared two options that fit the brief. Would you prefer to start with the detached home or the lower-priced semi?”\n\nPrepared for review. No message sent and no showing booked.`;

// Anchor a fresh sample week to the visitor's current date. The seed remains fixed
// for the session so revisiting a tab cannot quietly change its history.
export function createSeed(now = new Date()) {
  const iso = now.toISOString();
  const day = (offset: number, hour = 9, minute = 0) => {
    const d = new Date(now); d.setDate(d.getDate() + offset); d.setHours(hour, minute, 0, 0); return d.toISOString();
  };
  const ago = (minutes: number) => new Date(+now - minutes * 60_000).toISOString();
  const date = (offset: number) => day(offset).slice(0, 10);
  const weekOf = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  };
  const week = weekOf(0);
  const markets: MarketRow[] = [
    { slug: 'toronto-on', name: 'Toronto', region: 'GTA', province: 'ON', centre_lat: 43.67, centre_lng: -79.37, min_lat: 43.62, min_lng: -79.49, max_lat: 43.75, max_lng: -79.25, active: true },
    { slug: 'mississauga-on', name: 'Mississauga', region: 'GTA', province: 'ON', centre_lat: 43.59, centre_lng: -79.64, min_lat: 43.51, min_lng: -79.75, max_lat: 43.68, max_lng: -79.52, active: true },
    { slug: 'hamilton-on', name: 'Hamilton', region: 'Golden Horseshoe', province: 'ON', centre_lat: 43.25, centre_lng: -79.87, min_lat: 43.19, min_lng: -79.98, max_lat: 43.32, max_lng: -79.75, active: true },
  ];
  const names = ['Sarah Chen', 'Daniel Patel', 'Maya Brooks', 'Oliver Martin', 'Priya Shah', 'Marcus Lee'];
  const briefs = [
    { status: 'active', timeline: '1-3m', min: 850000, max: 1100000, beds: 3, baths: 2, type: 'detached', market: 'toronto-on', area: 'East Toronto', approved: true, representation: 'buyer_rep_signed' },
    { status: 'active', timeline: '1-3m', min: 650000, max: 850000, beds: 2, baths: 2, type: 'townhouse', market: 'toronto-on', area: 'Toronto east end', approved: true, representation: 'buyer_rep_signed' },
    { status: 'nurturing', timeline: '3-6m', min: 850000, max: 1100000, beds: 3, baths: 2, type: 'detached', market: 'toronto-on', area: 'East York', approved: true, representation: 'buyer_rep_signed' },
    { status: 'active', timeline: '6m-plus', min: 500000, max: 675000, beds: 2, baths: 1, type: 'condo_apt', market: 'toronto-on', area: 'Downtown Toronto', approved: false, representation: 'unsigned' },
    { status: 'active', timeline: '1-3m', min: 1100000, max: 1500000, beds: 4, baths: 3, type: 'detached', market: 'mississauga-on', area: 'Mississauga', approved: true, representation: 'buyer_rep_signed' },
    { status: 'active', timeline: '3-6m', min: 550000, max: 750000, beds: 3, baths: 2, type: 'semi', market: 'hamilton-on', area: 'Hamilton', approved: true, representation: 'buyer_rep_signed' },
  ] as const;
  const clients: Client[] = names.map((name, i) => {
    const b = briefs[i];
    return {
      id: `client-${i + 1}`, org_id: DEMO_ORG, display_name: name, fub_person_id: `${101 + i}`,
      status: b.status, timeline: b.timeline, representation: b.representation,
      representation_expires_at: b.representation === 'buyer_rep_signed' ? day(120) : null,
      budget_min: b.min, budget_max: b.max,
      budget_stretch_pct: 0, preapproved: b.approved, preapproval_amount: b.approved ? b.max : null,
      preapproval_expires_at: b.approved ? day(45) : null, down_payment: b.approved ? Math.round(b.max * 0.2) : null,
      financing_notes: b.approved ? 'Fictional pre-approval. Reconfirm before any offer.' : 'Financing conversation still to be confirmed.',
      client_voice: i === 0 ? 'A quieter street, room to grow, and a manageable commute.' : 'Practical layout and predictable monthly costs.',
      process_notes: 'Prepare a short comparison before asking for the next decision.', criteria_confirmed_at: day(-3), budget_confirmed_at: day(-3), last_reviewed_at: day(-1),
    };
  });
  const criteria: Criterion[] = clients.flatMap((c, i) => [
    { id: `${c.id}-beds`, client_id: c.id, kind: 'must', field: 'bedrooms', op: 'gte', value: briefs[i].beds, weight: 1, label: `At least ${briefs[i].beds} bedrooms`, confirmed_at: day(-3) },
    { id: `${c.id}-baths`, client_id: c.id, kind: 'must', field: 'bathrooms', op: 'gte', value: briefs[i].baths, weight: 1, label: `At least ${briefs[i].baths} bathroom${briefs[i].baths === 1 ? '' : 's'}`, confirmed_at: day(-3) },
    { id: `${c.id}-parking`, client_id: c.id, kind: 'must', field: 'parking_spaces', op: 'gte', value: 1, weight: 1, label: 'A parking space', confirmed_at: day(-3) },
    { id: `${c.id}-type`, client_id: c.id, kind: 'nice', field: 'property_type', op: 'eq', value: briefs[i].type, weight: 2, label: `Prefer ${briefs[i].type.replace('_', ' ')} homes`, confirmed_at: day(-3) },
  ]);
  const geography: ClientGeography[] = clients.map((c, i) => ({ id: `${c.id}-geo`, client_id: c.id, market_slug: briefs[i].market, neighbourhood: null, kind: 'target', rank: 1, note: `${briefs[i].area} and nearby neighbourhoods`, confirmed_at: day(-3) }));
  const homes = [
    ['18 Sample Lane', 995000, 3, 2, 1, 'semi', 43.665, -79.324, 'Leslieville'],
    ['42 Example Avenue', 1075000, 4, 2, 2, 'detached', 43.679, -79.335, 'Riverdale'],
    ['7 Illustrative Court', 795000, 2, 2, 1, 'townhouse', 43.686, -79.311, 'Danforth'],
    ['63 Demo Crescent', 1195000, 4, 3, 2, 'detached', 43.674, -79.302, 'The Beaches'],
    ['29 Sample Terrace', 1049000, 3, 2, 1, 'detached', 43.697, -79.345, 'East York'],
    ['11 Example Mews', 725000, 2, 2, 1, 'condo_apt', 43.656, -79.355, 'Corktown'],
    ['3 Illustration Place', 625000, 2, 1, 1, 'condo_apt', 43.649, -79.374, 'St. Lawrence'],
    ['56 Sample Road', 669000, 3, 2, 1, 'semi', 43.663, -79.348, 'Regent Park'],
    ['21 Fictional Drive', 1449000, 4, 3, 2, 'detached', 43.585, -79.632, 'Mississauga'],
    ['9 Demo Gardens', 1189000, 4, 3, 1, 'townhouse', 43.604, -79.615, 'Mississauga'],
    ['14 Showcase Street', 679000, 3, 2, 1, 'semi', 43.251, -79.867, 'Kirkendall'],
    ['32 Practice Avenue', 739000, 3, 2, 1, 'detached', 43.267, -79.843, 'Delta'],
  ] as const;
  const listingMarkets = ['toronto-on', 'toronto-on', 'toronto-on', 'toronto-on', 'toronto-on', 'toronto-on', 'toronto-on', 'toronto-on', 'mississauga-on', 'mississauga-on', 'hamilton-on', 'hamilton-on'];
  const listings: Listing[] = homes.map((h, i) => ({
    id: `listing-${i + 1}`, org_id: DEMO_ORG, market_slug: listingMarkets[i], province: 'ON', address_raw: h[0], address_norm: h[0].toLowerCase(), unit_norm: '', neighbourhood: h[8],
    lat: h[6], lng: h[7], bedrooms: h[2], bathrooms: h[3], sqft: 1400 + i * 95, property_type: h[5], parking_spaces: h[4],
    tenure: 'for_sale', status: 'active', list_price: h[1], currency: 'CAD', maintenance_fee: i === 5 ? 410 : null, listed_at: day(-i - 1), days_on_market: i + 1,
    sold_price: null, sold_at: null, listing_url: null, image_url: null,
    description: `Fictional ${h[5].replace('_', ' ')} used to demonstrate buyer matching. A bright main floor, flexible living space, and neighbourhood amenities. This is not an advertised property.`,
    source_id: 'manual', source_listing_id: null, source_fetched_at: iso, source_confidence: 'user_entered', can_display: true, can_share_with_client: false, raw_payload: {},
  }));
  const soldRows: [string, number, number, number, number, Listing['property_type'], number, number, string, string, number][] = [
    ['6 Sample Lane — Sold', 972000, 3, 2, 1, 'semi', 43.666, -79.319, 'Leslieville', 'toronto-on', -28],
    ['24 Example Road — Sold', 1035000, 3, 2, 1, 'semi', 43.662, -79.331, 'Leslieville', 'toronto-on', -61],
    ['51 Demo Avenue — Sold', 1012000, 3, 2, 1, 'semi', 43.671, -79.326, 'Riverdale', 'toronto-on', -104],
  ];
  const soldComps: Listing[] = soldRows.map((h, i): Listing => ({
    id: `sold-sample-${i + 1}`, org_id: DEMO_ORG, market_slug: h[9], province: 'ON', address_raw: h[0], address_norm: h[0].toLowerCase(), unit_norm: '', neighbourhood: h[8],
    lat: h[6], lng: h[7], bedrooms: h[2], bathrooms: h[3], sqft: 1440 + i * 40, property_type: h[5], parking_spaces: h[4],
    tenure: 'sold', status: 'sold', list_price: h[1] + 25000, currency: 'CAD', maintenance_fee: null, listed_at: day(h[10] - 25), days_on_market: 18 + i * 4,
    sold_price: h[1], sold_at: day(h[10]), listing_url: null, image_url: null,
    description: 'Fictional nearby closed sale included only to demonstrate comparable-sale context. Not a real transaction or valuation.',
    source_id: 'manual', source_listing_id: null, source_fetched_at: iso, source_confidence: 'user_entered', can_display: true, can_share_with_client: false, raw_payload: {},
  }));
  listings.push(...soldComps);
  const calendars: CalendarRow[] = [
    { id: 'asap', org_id: DEMO_ORG, name: 'ASAP · Buyer preparation', kind: 'asap', colour: '#496F95', visible: true, is_default: true },
    { id: 'asap-research', org_id: DEMO_ORG, name: 'ASAP · Market research', kind: 'asap', colour: '#687580', visible: true, is_default: false },
    { id: 'asap-outreach', org_id: DEMO_ORG, name: 'ASAP · Outreach & CRM', kind: 'asap', colour: '#3D8B5D', visible: true, is_default: false },
    { id: 'asap-content', org_id: DEMO_ORG, name: 'ASAP · Content & reporting', kind: 'asap', colour: '#7A5EA8', visible: true, is_default: false },
  ];
  // Work orders belong to ASAP. Client contact and publishing stay subject to approval.
  const workOrders = [
    ['asap', 'Prepare Sarah’s buyer shortlist', 'Compare selected homes against Sarah’s confirmed requirements. Output: ranked shortlist, tradeoffs, and showing questions for review.', 'client-1', 'listing-2'],
    ['asap-outreach', 'Draft priority buyer follow-ups', 'Review unanswered conversations and prepare client-specific next-step drafts. Output: approval queue; no messages sent.', 'client-2', null],
    ['asap-research', 'Review East Toronto price changes', 'Compare current asking prices with available sold records. Output: dated change summary with source references and evidence gaps.', null, null],
    ['asap-content', 'Prepare neighbourhood content brief', 'Turn neighbourhood research into a useful buyer education outline. Output: draft brief for editorial review; no publishing.', null, null],
    ['asap', 'Refresh Daniel’s townhouse matches', 'Check Daniel’s budget, bedrooms, parking, and target areas. Output: eligible matches with reasons and unresolved questions.', 'client-2', 'listing-3'],
    ['asap-outreach', 'Review CRM next actions', 'Check client records for missing next steps and overdue follow-ups. Output: prioritized action list and proposed record updates.', null, null],
    ['asap-research', 'Compare Leslieville sold evidence', 'Separate sold comparables from active listings and note differences in layout, condition, and timing. Output: comparison brief for review.', 'client-1', 'listing-1'],
    ['asap-content', 'Draft listing launch checklist', 'Review the listing record for missing media, disclosures, and description inputs. Output: readiness checklist and draft launch copy.', null, 'listing-2'],
    ['asap', 'Check Priya’s financing inputs', 'Review budget and pre-approval dates against the buyer brief. Output: stale-input flags and confirmation questions; no financing advice.', 'client-5', null],
    ['asap-outreach', 'Prepare Maya’s nurture sequence', 'Use Maya’s timeline and criteria to draft a relevant next conversation. Output: follow-up drafts requiring approval before contact.', 'client-3', null],
    ['asap-research', 'Scan Hamilton listing changes', 'Review new, changed, and withdrawn homes against Marcus’s requirements. Output: listing-change digest with matching explanations.', 'client-6', 'listing-11'],
    ['asap-content', 'Compile weekly execution report', 'Compare scheduled work with recorded outputs, held approvals, and failures. Output: execution summary and unresolved blockers.', null, null],
    ['asap', 'Prepare Oliver’s criteria questions', 'Identify unconfirmed financing and gaps in Oliver’s buying brief. Output: focused clarification checklist for the next conversation.', 'client-4', null],
    ['asap-outreach', 'Check duplicate CRM records', 'Compare names and contact details without merging uncertain identities. Output: proposed duplicate pairs and a human review list.', null, null],
    ['asap-research', 'Review Mississauga match tradeoffs', 'Compare Priya’s eligible homes on price, bedrooms, parking, and geography. Output: evidence-linked tradeoff brief.', 'client-5', 'listing-9'],
    ['asap-content', 'Draft buyer education outline', 'Prepare a plain-language outline on comparing property options. Output: draft content with factual claims flagged for review.', null, null],
    ['asap', 'Prepare showing questions for Sarah', 'Review the shortlisted homes for missing disclosures and unanswered questions. Output: property-specific preparation packet; no showing booked.', 'client-1', 'listing-2'],
    ['asap-outreach', 'Review held outreach approvals', 'Check drafts waiting on consent, missing facts, or a reviewer decision. Output: blocker summary; held messages remain unsent.', null, null],
    ['asap-research', 'Check shortlist freshness', 'Recheck listing status, price changes, and dated buyer inputs. Output: stale-match flags and candidates needing renewed review.', null, null],
    ['asap-content', 'Prepare next week’s work priorities', 'Use execution history and outstanding client work to propose the next schedule. Output: prioritized work blocks for approval.', null, null],
  ] as const;
  const events: CalendarEvent[] = [];
  for (let offset = -14; offset <= 35; offset++) {
    const scheduleDate = new Date(day(offset));
    // Weekend work is a lighter monitoring and preparation queue.
    const weekend = [0, 6].includes(scheduleDate.getDay());
    const hours = weekend ? [9, 13] : [8, 10, 13, 15];
    hours.forEach((hour, j) => {
      const index = ((offset * 4 + j) % workOrders.length + workOrders.length) % workOrders.length;
      const task = workOrders[index];
      events.push({
        id: `event-${offset}-${j}`, org_id: DEMO_ORG, calendar_id: task[0], title: task[1], description: task[2], location: null,
        starts_at: day(offset, hour), ends_at: day(offset, hour, j % 2 ? 30 : 45), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto', all_day: false, start_date: null, end_date: null,
        rrule: null, recurrence_id: null, exdates: [], busy: true, status: 'confirmed', source: 'asap', external_id: null,
        asap_signature: 'showcase-work-plan-v2', client_id: task[3], listing_id: task[4], created_by: 'asap', created_at: iso, updated_at: iso,
      });
    });
  }
  const logs: ExecutionLogRow[] = [
    { id: 1, org_id: DEMO_ORG, week_start: week, calendar_event_id: 'event-0-0', block_category: 'prep', block_title: 'Sarah’s buyer preparation packet', status: 'needs_approval', output_summary: 'Two options compared. Showing questions and follow-up draft ready for your review.', artifact_text: PACKET, approved: null, executed_at: ago(10) },
    ...Array.from({ length: 10 }, (_, i): ExecutionLogRow => ({ id: i + 2, org_id: DEMO_ORG, week_start: week, calendar_event_id: null,
      block_category: ['outreach', 'crm', 'prep', 'content'][i % 4], block_title: ['Priority buyer follow-up drafts', 'CRM next actions organized', 'Buyer criteria review prepared', 'Neighbourhood content brief'][i % 4],
      status: i === 8 ? 'skipped' : i === 9 ? 'failed' : 'executed', output_summary: i === 8 ? 'Moved out of the sample week to protect buyer preparation time.' : i === 9 ? 'Missing property disclosures; additional information required.' : 'Sample preparation completed. No external communication sent.', approved: null, executed_at: ago(60 + i * 250),
    })),
  ];
  // A compact two-week work history makes Home's trend useful without adding
  // synthetic chart-only values: every completed block also appears in Memory.
  const priorWork: ExecutionLogRow[] = Array.from({ length: 21 }, (_, i) => {
    const daysBack = 21 - i;
    const categories = ['outreach', 'crm', 'prep', 'content', 'crm', 'outreach', 'prep'] as const;
    const category = categories[i % categories.length];
    const title = category === 'outreach' ? 'Buyer follow-up draft prepared'
      : category === 'crm' ? 'Buyer records and next actions updated'
        : category === 'prep' ? 'Showing brief and questions prepared' : 'Neighbourhood content outline drafted';
    return {
      id: 20 + i, org_id: DEMO_ORG, week_start: weekOf(-daysBack), calendar_event_id: null,
      block_category: category, block_title: title,
      status: daysBack === 16 ? 'needs_approval' : daysBack === 9 ? 'skipped' : daysBack === 5 ? 'failed' : 'executed',
      output_summary: daysBack === 16 ? 'Draft buyer comparison prepared and held for realtor review.' : daysBack === 9 ? 'Held while the realtor handled a client appointment.' : daysBack === 5 ? 'Waiting on current property information before completing the comparison.' : 'Fictional sample work completed for the active buyer pipeline. No external communication sent.',
      artifact_text: null, approved: null, executed_at: day(-daysBack, 9 + (i % 5), 15),
    };
  });
  logs.push(...priorWork);
  const weekly: WeeklyExecutionRow[] = [1, 2, 3].map((n) => {
    const weekStart = weekOf(-7 * n);
    const rows = logs.filter((row) => row.week_start === weekStart);
    const counts = (status: string) => rows.reduce<Record<string, number>>((out, row) => {
      if (row.status === status) {
        const category = row.block_category ?? 'unresolved';
        out[category] = (out[category] ?? 0) + 1;
      }
      return out;
    }, {});
    return {
      week_start: weekStart, blocks_scheduled: rows.length,
      blocks_executed: rows.filter((row) => row.status === 'executed').length,
      blocks_skipped: rows.filter((row) => row.status === 'skipped').length,
      categories_completed: counts('executed'), categories_skipped: counts('skipped'),
      drafts_produced: rows.filter((row) => row.status === 'needs_approval').length,
      drafts_approved: rows.filter((row) => row.approved === true).length,
      execution_win: 'Buyer preparation led to clearer next-step conversations.', execution_bottleneck: 'Too much content work competing with buyer follow-up.',
      summary: `Sample retrospective: ${rows.filter((row) => row.status === 'executed').length} of ${rows.length} logged blocks completed; protect buyer follow-up, batch content, and leave room for appointments.`,
      created_at: day(-7 * n),
    };
  });
  const agentEvents: AgentEventRow[] = logs.map((r, i) => ({ id: `beat-${i}`, org_id: DEMO_ORG, sequence: 200 - i, agent_id: 'asap', event_type: `block.${r.status}`, created_at: r.executed_at,
    payload: { calendar_event_id: r.calendar_event_id ?? undefined, block_title: r.block_title ?? undefined, block_category: r.block_category ?? undefined, output_summary: r.output_summary ?? undefined, lead_name: i === 0 ? 'Sarah Chen' : undefined },
  }));
  const crmHistory = [
    { days: 12, type: 'fub.note_created', client: 0, summary: 'Recorded Sarah’s must-haves after the buyer consultation.' },
    { days: 10, type: 'fub.task_completed', client: 1, summary: 'Completed Daniel’s financing follow-up reminder.' },
    { days: 8, type: 'fub.appointment_booked', client: 0, summary: 'Added a sample buyer consultation to Sarah’s timeline.' },
    { days: 6, type: 'fub.stage_advanced', client: 4, summary: 'Moved Priya’s sample opportunity into active buyer follow-up.' },
    { days: 4, type: 'fub.note_created', client: 5, summary: 'Captured Marcus’s preferred Hamilton neighbourhoods.' },
    { days: 2, type: 'fub.task_completed', client: 2, summary: 'Closed Maya’s timeline check-in task.' },
  ];
  crmHistory.forEach((entry, i) => agentEvents.push({
    id: `crm-history-${i}`, org_id: DEMO_ORG, sequence: 70 - i, agent_id: 'asap', event_type: entry.type,
    created_at: day(-entry.days, 10, 30),
    payload: { lead_id: `${101 + entry.client}`, lead_name: names[entry.client], note_preview: entry.summary, task_name: entry.summary, title: entry.summary },
  }));
  names.forEach((name, i) => agentEvents.push({ id: `pulse-${i}`, org_id: DEMO_ORG, sequence: 60 - i, agent_id: 'asap', event_type: 'lead.engaged', created_at: day(-Math.min(i * 2, 12), 11, 10),
    payload: { lead_id: `${101 + i}`, lead_name: name, pulse: ['hot', 'warming', 'cooling', 'cold', 'warming', 'cooling'][i], stage: ['Active Buyer', 'Active Buyer', 'Nurture', 'New Lead', 'Active Buyer', 'Active Buyer'][i], action: ['Review the buyer packet', 'Confirm must-haves', 'Check the timeline', 'Prepare a first conversation', 'Compare Mississauga options', 'Confirm Hamilton search area'][i], days_since_last_contact: i * 2 },
  }));
  const ledger: TaskLedgerRow[] = logs.map(r => ({ id: r.id, org_id: DEMO_ORG, task_id: `task-${r.id}`, task_type: r.block_category ?? 'prep', summary: r.block_title ?? '', model: 'Sample activity', tokens_in: null, tokens_out: null, tokens: null, cost_usd: null, runtime_ms: null, status: r.status === 'failed' ? 'error' : r.status === 'skipped' ? 'partial' : 'ok', created_at: r.executed_at }));
  const alerts: AlertRow[] = [
    { id: 1, org_id: DEMO_ORG, kind: 'approval_needed', title: 'Sarah’s buyer packet is ready', body: 'Review the shortlist, questions, and follow-up draft before the consultation.', channel: 'in_app', severity: 'info', status: 'active', related_url: '/', last_triggered_at: ago(10), created_at: ago(10), acknowledged_at: null },
    { id: 2, org_id: DEMO_ORG, kind: 'deadline', title: 'Confirm Daniel’s financing timeline', body: 'Sample reminder: confirm pre-approval before preparing the next offer.', channel: 'in_app', severity: 'warning', status: 'active', related_url: '/clients', last_triggered_at: ago(40), created_at: ago(40), acknowledged_at: null },
  ];
  const mandate: MandateRow = { org_id: DEMO_ORG, autonomy_level: 'draft', permissions: { draft_replies: true, update_crm: true, generate_docs: true, book_meetings: false, send_email: false, send_sms: false }, focus: 'Move priority buyer decisions forward this week.', guardrails: 'Prepare client work for review. Protect personal time. Ask before client contact.', client_comms_enabled: false, active_markets: markets.map((market) => market.slug), match_min_band: 'possible', match_daily_cap: 5, match_stale_days: 90 };
  const prefs: AlertPrefs = { org_id: DEMO_ORG, channel: 'in_app', quiet_hours_start: '21:00:00', quiet_hours_end: '08:00:00', timezone: 'America/Toronto', digest_frequency: 'daily', urgent_override: true, consent: false };
  const people: FubPerson[] = names.map((name, i) => ({ id: 101 + i, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1], stage: ['Active Buyer', 'Active Buyer', 'Nurture', 'New Lead', 'Active Buyer', 'Active Buyer'][i], source: ['Referral', 'Open house', 'Past client', 'Website', 'Referral', 'Neighbourhood event'][i], tags: ['Fictional demo', i === 3 ? 'First-time buyer' : 'Buyer'], emails: [{ value: `${name.split(' ')[0].toLowerCase()}@example.com`, type: 'home' }], phones: [], assignedTo: 'Alex Morgan', assignedUserId: 1, created: day(-30), updated: ago(60), lastActivity: day(-i), contacted: i + 1, price: briefs[i].max, timeframeId: null, timeframeStatus: briefs[i].timeline === '6m-plus' ? '6+ months' : briefs[i].timeline === '3-6m' ? '3–6 months' : '1–3 months', dealName: null, dealStage: null, dealPrice: null, dealCloseDate: null, addresses: [], fubUrl: '' }));
  const notesByClient = [
    ['Sarah wants a quieter street and at least 3 bedrooms. The shortlist should balance commute and outdoor space.', -12],
    ['Daniel has confirmed the townhouse preference; reconfirm the current financing limit before any offer.', -10],
    ['Maya is still exploring a 3–6 month move. Check in before refreshing the shortlist.', -2],
    ['Oliver is a first-time buyer. Start with a financing conversation and keep early options within budget.', -1],
    ['Priya is upsizing in Mississauga. Compare family layout, parking, and commute needs.', -6],
    ['Marcus prefers Hamilton and wants a practical three-bedroom home with parking.', -4],
  ] as const;
  const details: FubPersonDetail[] = people.map((person, i) => ({ person,
    notes: [{ id: i + 1, subject: 'Sample buyer conversation', body: notesByClient[i][0], created: day(notesByClient[i][1], 10, 30), createdBy: 'Alex Morgan' }],
    tasks: [{ id: i + 1, name: ['Review Sarah’s preparation packet', 'Confirm Daniel’s financing timeline', 'Check Maya’s buying timeline', 'Arrange an introductory financing conversation', 'Compare Mississauga family homes', 'Confirm Hamilton search area'][i], dueDate: date(i === 1 || i === 2 ? -1 : 1), isCompleted: i === 1 || i === 2 }],
    appointments: i === 0 ? [{ id: 1, title: 'Buyer consultation', start: day(0, 14), end: day(0, 14, 45), location: 'Toronto · sample scenario' }] : [], deals: [],
  }));
  return {
    user_profiles: [{ id: DEMO_USER, auth_user_id: DEMO_USER, org_id: DEMO_ORG, first_name: 'Guest', last_name: 'User', role: 'Realtor' }],
    msp_success_plans: [{ id: 'monthly', org_id: DEMO_ORG, form_date: date(0), goal_income: 30000, avg_commission: 10000, primary_market: 'Toronto — East end', main_focus: 'Buyer representation', bottleneck: 'Inconsistent buyer follow-up', hours_available: 35, working_hours: '8 AM–5 PM', lead_gen: 'Referrals and open houses', marketing_priority: 'Useful neighbourhood content', schedule_notes: 'Protect lunch and family commitments.' }],
    asap_plans: [{ id: 'weekly', org_id: DEMO_ORG, week_start: week, weekly_priority: 'Prepare Sarah’s shortlist and secure a clear next step.', bottleneck: 'Too much content work competing with buyer follow-up.', events_created: events.filter(e => e.starts_at && e.starts_at >= day(0, 0)).map(e => ({ eventName: e.title, description: e.description, start: e.starts_at, colorId: e.calendar_id === 'asap' ? '7' : '1' })) }],
    asap_clients: clients, asap_client_criteria: criteria, asap_client_geography: geography, asap_markets: markets, asap_listings: listings,
    asap_client_matches: [], asap_calendars: calendars, asap_calendar_events: events, asap_execution_log: logs, asap_weekly_execution: weekly,
    agent_events: agentEvents, agent_task_ledger: ledger, asap_alerts: alerts, asap_alert_prefs: [prefs], asap_agent_mandate: [mandate],
    demo_people: people, demo_person_details: details, asap_documents: [],
  };
}
