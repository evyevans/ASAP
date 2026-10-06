/* ═══════════════════════════════════════════════════════════════════════════
   sceneDirector — the brain behind the ASAP butler.

   THE PROBLEM THIS SOLVES
   The retired presence layer derived the whole performance from a stopwatch:
   "is the socket up?" + "how many seconds since ANY event?" (presenceState.ts).
   Four modes. That is why the character had no utility — it never knew WHAT
   ASAP did, only THAT something happened recently. Meanwhile the live feed
   carries 30+ distinct semantic event types.

   THE FIX
   One pure function turns the real feed into a SceneState: which act the butler
   performs, what each instrumented prop reads out, and what the user can act on.
   Everything visible on screen is a projection of this object, so "the butler
   shows the truth" is a TESTED property rather than a hope.

   Pure + `now` injected → fully unit-testable. No React, no three.js in here.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { PlannedEvent } from '../analytics/executionTypes';
import type { AgentEventPayload } from '../analytics/agentEventTypes';

/* ── The closed act vocabulary ────────────────────────────────────────────
   Deliberately small. The brief was "consistent, not overly complex variant
   styles", so 30+ event types collapse into 9 canonical motions. Adding a new
   event type must map onto an existing act, never invent a tenth.

   VOICE IS THE ONE EXCEPTION, AND IT IS A NARROW ONE
   `listening` and `speaking` are acts 10 and 11. They do not break the rule
   above, because that rule governs EVENT TYPES: every entry in ACT_BY_EVENT
   still resolves to one of the original nine, and actForEvent() can never
   return either of these. They exist because voice is a new input MODALITY,
   not a new kind of thing ASAP did — nothing in agent_events could ever mean
   "the user is holding the mic button down", and mapping that onto `standby`
   or `presenting` would be a lie the character tells with its body. */
export type Act =
  | 'dormant'      // powered down — the realtime channel is gone
  | 'standby'      // heels together, one hand behind the back, breathing
  | 'drafting'     // leans into the desk, both hands typing
  | 'reviewing'    // holds a document chest-high, monocle scan-line sweeps
  | 'presenting'   // turns to camera and extends the document — needs you
  | 'dispatching'  // handset to visor, free hand gesturing
  | 'filing'       // turns to the cabinet, slides a drawer, files a folder
  | 'commending'   // tips the top hat + small bow — a win landed
  | 'alerting'     // straightens, gloved hand raised, arcs go error-red
  | 'listening'    // LOCAL ONLY — turns to camera, still, aperture wide
  | 'speaking';    // LOCAL ONLY — addresses the camera, core pulses with speech

/** The nine acts the live feed can produce. Local voice acts are excluded by
 *  construction, which is what keeps ACT_BY_EVENT a closed set. */
export const EVENT_ACTS: readonly Act[] = [
  'dormant', 'standby', 'drafting', 'reviewing', 'presenting',
  'dispatching', 'filing', 'commending', 'alerting',
];

/** Acts only the local voice session can produce. */
export const VOICE_ACTS: readonly Act[] = ['listening', 'speaking'];

/** Acts that play once and then fall through to whatever is underneath. */
export const TRANSIENT_ACTS: readonly Act[] = ['commending', 'alerting'];

/** Acts that hold while work is genuinely in flight. */
export const SUSTAINED_ACTS: readonly Act[] = ['drafting', 'reviewing', 'dispatching', 'filing'];

/* ── Timing windows (ms) ──────────────────────────────────────────────────
   Tuned so the butler reads as deliberate, not twitchy: a win is celebrated
   for a beat, a failure holds long enough to be noticed, and real work keeps
   him busy for a sensible stretch after the last event. */
export const WINDOW = {
  /** How long `commending` (tip of the hat) plays after a win. */
  commend: 2_600,
  /** How long `alerting` holds after a failure — longer, it must be noticed. */
  alert: 7_000,
  /** A fresh approval request commands the stage for this long. */
  present: 12_000,
  /** Work-in-flight acts hold this long after their last event. */
  sustain: 9_000,
  /** Events inside this window count toward the intensity (busyness) signal. */
  intensity: 60_000,
} as const;

/* ── Event → act ──────────────────────────────────────────────────────────
   The single mapping table. Exported so the test suite can assert that EVERY
   event type in the live vocabulary is accounted for — an unmapped event is a
   butler who stands still while ASAP works, which is the exact bug we're
   fixing. `null` means "log-only": real, but not something to act out. */
export const ACT_BY_EVENT: Record<string, Act | null> = {
  // ── block lifecycle ──
  'block.started': 'drafting',
  'block.executed': 'commending',
  'block.needs_approval': 'presenting',
  'block.failed': 'alerting',
  'block.skipped': null, // a skipped block is a non-event to perform

  // ── approval lifecycle ──
  'draft.approved': 'commending',
  'draft.rejected': null, // the user's own decision — nothing to act out
  'doc.generated': 'presenting',
  'doc.approved': 'commending',
  'doc.rejected': null,
  'doc.expired': 'alerting',

  // ── FUB mutations ──
  'fub.note_created': 'dispatching',
  'fub.task_created': 'dispatching',
  'fub.task_completed': 'commending',
  'fub.appointment_booked': 'commending',
  'fub.stage_advanced': 'commending',
  'fub.deal_created': 'commending',
  'fub.deal_updated': 'dispatching',
  'fub.person_updated': 'dispatching',

  // ── DAAM lead sweep ──
  'lead.new': 'dispatching',
  'lead.stage_changed': 'dispatching',
  'lead.overdue': 'alerting',
  'lead.engaged': 'dispatching',

  // ── research + memory ──
  'research.compiled': 'reviewing',

  // ── system ──
  'system.heartbeat': null, // freshness only — never animate a heartbeat
  'system.error': 'alerting',
  'system.scheduler_fired': null,
  'system.snapshot_created': 'filing',

  // ── external side-effects ──
  'ext.vector_synced': 'filing',
  'ext.email_sent': 'dispatching',
  'ext.calendar_event_created': 'dispatching',
  'ext.call_outcome': 'commending',
  'ext.webhook_received': 'reviewing',

  // ── client matching (migrations 16-18) ──
  // Every one maps onto an EXISTING act, per the rule above. Reading listings
  // against a brief is reviewing; the owner keeping one is a win; the owner
  // rejecting one is their own decision and not something to act out.
  'match.found': 'reviewing',
  'match.shortlisted': 'commending',
  'match.dismissed': null,
  'client.profile_updated': 'filing',
  'client.criteria_stale': 'alerting',
  'listing.ingested': 'filing',

  // ── ASAP calendar (migration 19) ──
  'cal.event_created': 'dispatching',
  'cal.event_updated': 'dispatching',
  'cal.conflict_detected': 'alerting',
};

/** Resolve an event type to its act, including prefix fallbacks for event
 *  types Hermes adds later that we haven't enumerated yet. Unknown families
 *  return null rather than guessing — a wrong motion is worse than stillness. */
export function actForEvent(eventType: string): Act | null {
  if (eventType in ACT_BY_EVENT) return ACT_BY_EVENT[eventType];
  // Forward-compatible family fallbacks.
  if (eventType.startsWith('fub.')) return 'dispatching';
  if (eventType.startsWith('lead.')) return 'dispatching';
  if (eventType.startsWith('doc.')) return 'reviewing';
  if (eventType.startsWith('block.')) return 'drafting';
  if (eventType.startsWith('match.')) return 'reviewing';
  if (eventType.startsWith('cal.')) return 'dispatching';
  if (eventType.startsWith('client.')) return 'filing';
  if (eventType.startsWith('listing.')) return 'filing';
  return null;
}

/* ── Inputs ───────────────────────────────────────────────────────────────
   Structurally minimal so tests can build fixtures by hand and so AgentEventRow
   remains assignable without an adapter. */
export interface DirectorEvent {
  id: string;
  event_type: string;
  created_at: string; // ISO 8601
  // Typed as the real payload union so AgentEventRow is assignable directly,
  // with no adapter and no `as` cast at the call site.
  payload?: AgentEventPayload | null;
}

/** The local voice turn, if one is in flight. Structural, not the whole store,
 *  so this module stays free of any React or zustand dependency. */
export interface VoiceInput {
  phase: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';
  /** ms epoch the phase began. */
  since: number;
}

export interface DirectorInput {
  /** Realtime channel state — false puts the butler to sleep, nothing else does. */
  connected: boolean;
  /** agent_events, NEWEST FIRST (the order useAgentEvents publishes). */
  events: DirectorEvent[];
  /** Rows awaiting your approve/reject decision (asap_execution_log). */
  pendingApprovals: number;
  /** Alerts still in `active` state (asap_alerts). */
  activeAlerts: number;
  /** Highest severity among the active alerts. */
  alertSeverity?: 'info' | 'warning' | 'critical' | null;
  /** This week's planned calendar blocks (asap_plans.events_created). */
  plannedEvents?: PlannedEvent[];
  /** Titles of blocks already executed, for striking through on the whiteboard. */
  executedTitles?: string[];
  /** The local voice turn. Absent or 'idle' means the feed drives everything. */
  voice?: VoiceInput | null;
  /** Injected clock (ms epoch) — keeps this function pure. */
  now: number;
}

/* ── Outputs ──────────────────────────────────────────────────────────────*/

export interface Beat {
  /** Headline — "ASAP is drafting…" */
  label: string;
  /** Sub-line — the human summary of the driving event. */
  caption: string;
  /** ISO timestamp of the event driving the current act (null when idle). */
  at: string | null;
}

export interface BoardItem {
  title: string;
  done: boolean;
}

export interface Readouts {
  /** The desk monitor — rendered to a live canvas texture. */
  monitor: { heading: string; body: string; stamp: string };
  /** The in-tray — the paper stack height IS this number. */
  tray: { pending: number };
  /** The whiteboard — this week's blocks, executed ones struck through. */
  board: { items: BoardItem[] };
  /** The desk phone — glows by severity. */
  phone: { alerts: number; severity: 'none' | 'info' | 'warning' | 'critical' };
  /** The wall clock — real hands, brass marker at the next block. */
  clock: { next: { title: string; at: string } | null };
  /** The filing cabinet — memory writes ASAP has made. */
  cabinet: { writes: number };
}

/** Something the user can actually do from inside the scene. */
export interface Hotspot {
  id: 'tray' | 'phone' | 'board' | 'monitor' | 'cabinet';
  label: string;
  /** Badge count — omitted when there's nothing pending. */
  count?: number;
  /** True when this hotspot commits a real write (vs. navigates). */
  actionable: boolean;
}

/** What the edges of the screen do.
 *
 *  This lives ON SceneState rather than in its own hook for one reason: the
 *  brief calls the edge glow a critical feature and names "real-time edge-glow
 *  synchronisation with agent state" as a risk. Deriving it here means the glow
 *  and the butler are two projections of ONE object, computed in one pass from
 *  one clock. There is no second state to drift. */
export interface Glow {
  /** Off entirely — nothing to say, so say nothing. */
  active: boolean;
  /** Which visual treatment: the orange think-glow, or its variants. */
  tone: 'none' | 'thinking' | 'listening' | 'speaking' | 'alert' | 'attention';
  /** 0…1 — how strongly to paint it. Feeds an opacity, never a layout value. */
  strength: number;
  /** Whether it should breathe. False under prefers-reduced-motion handling. */
  pulse: boolean;
}

export interface SceneState {
  act: Act;
  /** 0…1 — how busy ASAP has been in the last minute. Scales motion speed. */
  intensity: number;
  /** True while the realtime channel is up. */
  live: boolean;
  beat: Beat;
  readouts: Readouts;
  hotspots: Hotspot[];
  /** The screen-edge treatment for this exact frame. */
  glow: Glow;
}

const NO_GLOW: Glow = { active: false, tone: 'none', strength: 0, pulse: false };

/** Map the resolved act to an edge treatment.
 *  Kept a pure function of `act` + `intensity` so it is trivially testable and
 *  cannot consult a second source. */
export function glowForAct(act: Act, intensity: number, pendingApprovals: number): Glow {
  switch (act) {
    // The orange think-glow the brief asks for. Strength rides intensity so a
    // busy minute burns brighter than a single lookup — and it is what makes a
    // multi-second wait on Hermes feel attended rather than frozen.
    case 'drafting':
    case 'reviewing':
    case 'dispatching':
    case 'filing':
      return { active: true, tone: 'thinking', strength: 0.45 + 0.55 * clamp01(intensity), pulse: true };
    case 'listening':
      return { active: true, tone: 'listening', strength: 0.9, pulse: true };
    case 'speaking':
      return { active: true, tone: 'speaking', strength: 0.75, pulse: true };
    case 'alerting':
      return { active: true, tone: 'alert', strength: 1, pulse: false };
    case 'presenting':
      return { active: true, tone: 'attention', strength: 0.6, pulse: false };
    case 'commending':
      // A win is celebrated by the character, not by the whole room.
      return NO_GLOW;
    case 'dormant':
    case 'standby':
    default:
      // Standing by with work waiting on you is not "quiet" — keep a low ember.
      return pendingApprovals > 0 && act === 'standby'
        ? { active: true, tone: 'attention', strength: 0.28, pulse: false }
        : NO_GLOW;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Edge treatment while a voice turn is in flight.
 *  This is the one place `transcribing` and `thinking` separate from
 *  `listening`: the character holds one attentive pose (swapping motion twice
 *  in two seconds reads as a twitch), while the glow carries the finer signal —
 *  which is exactly the job the brief gives it, "glow orange while Hermes is
 *  thinking". It is also the latency mask: the edges light the instant the mic
 *  closes, so the wait on Hermes is attended rather than dead. */
export function glowForVoice(phase: VoiceInput['phase']): Glow {
  switch (phase) {
    case 'listening':    return { active: true, tone: 'listening', strength: 0.9, pulse: true };
    case 'transcribing': return { active: true, tone: 'thinking', strength: 0.7, pulse: true };
    case 'thinking':     return { active: true, tone: 'thinking', strength: 1, pulse: true };
    case 'speaking':     return { active: true, tone: 'speaking', strength: 0.75, pulse: true };
    default:             return NO_GLOW;
  }
}

/* ── Human copy ───────────────────────────────────────────────────────────*/

const LABEL: Record<Act, string> = {
  dormant: 'ASAP is offline',
  standby: 'ASAP is standing by',
  drafting: 'ASAP is drafting…',
  reviewing: 'ASAP is reviewing…',
  presenting: 'ASAP needs your approval',
  dispatching: 'ASAP is working your pipeline…',
  filing: 'ASAP is filing to memory…',
  commending: 'ASAP got it done',
  alerting: 'ASAP hit a problem',
  listening: 'ASAP is listening…',
  speaking: 'ASAP is speaking…',
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/** One-line human summary of an event. Kept here (not in describeEvent.tsx) so
 *  the director stays pure TypeScript with no JSX dependency. */
export function summarise(e: DirectorEvent): string {
  const p = e.payload ?? {};
  const title = str(p.block_title) ?? str(p.title) ?? str(p.deal_name) ?? str(p.task_name);
  const summary = str(p.output_summary);
  const lead = str(p.lead_name);

  switch (e.event_type) {
    case 'block.started': return title ? `Started "${title}"` : 'Started a calendar block';
    case 'block.executed': return title ? `Finished "${title}"` : (summary ?? 'Finished a calendar block');
    case 'block.needs_approval': return title ? `"${title}" is ready for your OK` : 'A draft is ready for your OK';
    case 'block.failed': return str(p.failure_reason) ?? 'A block failed to run';
    case 'doc.generated': return title ? `Prepared "${title}"` : 'Prepared a document for you';
    case 'doc.approved': return 'You approved a document';
    case 'doc.expired': return 'A document expired before it was signed';
    case 'draft.approved': return 'Draft approved';
    case 'research.compiled': return str(p.topic) ? `Researched ${str(p.topic)}` : 'Compiled market research';
    case 'fub.note_created': return lead ? `Logged a note on ${lead}` : 'Logged a CRM note';
    case 'fub.task_created': return title ? `Created task "${title}"` : 'Created a CRM task';
    case 'fub.task_completed': return title ? `Completed "${title}"` : 'Completed a CRM task';
    case 'fub.appointment_booked': return lead ? `Booked an appointment with ${lead}` : 'Booked an appointment';
    case 'fub.stage_advanced': return lead ? `Advanced ${lead} to ${str(p.to_stage) ?? 'the next stage'}` : 'Advanced a lead';
    case 'fub.deal_created': return title ? `Opened deal "${title}"` : 'Opened a new deal';
    case 'fub.deal_updated': return title ? `Updated deal "${title}"` : 'Updated a deal';
    case 'fub.person_updated': return lead ? `Updated ${lead}` : 'Updated a contact';
    case 'lead.new': return lead ? `New lead — ${lead}` : 'A new lead arrived';
    case 'lead.engaged': return lead ? `Re-engaged ${lead}` : 'Re-engaged a lead';
    case 'lead.overdue': return lead ? `${lead} is overdue for follow-up` : 'A lead is overdue';
    case 'lead.stage_changed': return lead ? `${lead} moved stage` : 'A lead moved stage';
    case 'system.error': return str(p.message) ?? 'A system error was raised';
    case 'ext.vector_synced': return 'Synced to long-term memory';
    case 'ext.email_sent': return 'Sent an email on your behalf';
    case 'ext.calendar_event_created': return title ? `Scheduled "${title}"` : 'Added a calendar event';

    // Client matching. Note what these DO NOT say: never "great deal", never
    // "below market", never a price verdict of any kind — SOUL.md Rule 5.
    // "Fit" is a fact about the buyer's criteria; value is not ours to claim.
    case 'match.found':
      return lead && title ? `Found ${title} for ${lead}`
        : lead ? `Found a match for ${lead}` : 'Found a property match';
    case 'match.shortlisted':
      return title ? `You shortlisted ${title}` : 'A match was shortlisted';
    case 'client.profile_updated':
      return lead ? `Updated ${lead}'s brief` : 'Updated a client brief';
    case 'client.criteria_stale':
      return lead ? `${lead}'s brief needs re-confirming` : 'A client brief has gone stale';
    case 'listing.ingested': {
      const n = typeof p.count === 'number' ? p.count : null;
      return n ? `Read ${n} new listing${n === 1 ? '' : 's'}` : 'Read new listings';
    }
    case 'cal.event_created': return title ? `Scheduled "${title}"` : 'Added something to your calendar';
    case 'cal.event_updated': return title ? `Moved "${title}"` : 'Moved a calendar event';
    case 'cal.conflict_detected': return title ? `"${title}" clashes with something` : 'Found a calendar clash';
    default:
      return summary ?? title ?? e.event_type.replace(/[._]/g, ' ');
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────*/

const ageMs = (e: DirectorEvent, now: number) => now - Date.parse(e.created_at);

/** Newest event (list is newest-first) whose act matches, within `window` ms. */
function freshest(
  events: DirectorEvent[],
  now: number,
  window: number,
  match: (a: Act) => boolean
): DirectorEvent | null {
  for (const e of events) {
    const age = ageMs(e, now);
    if (!Number.isFinite(age)) continue; // unparsable timestamp — skip, never crash
    if (age < 0) continue;               // clock skew: an event "from the future"
    if (age >= window) break;            // newest-first ⇒ everything older is out
    const act = actForEvent(e.event_type);
    if (act && match(act)) return e;
  }
  return null;
}

/** 0…1 busyness from how many real events landed in the last minute.
 *  Saturates at 12 events/min — beyond that "busier" stops reading visually. */
export function computeIntensity(events: DirectorEvent[], now: number): number {
  let n = 0;
  for (const e of events) {
    const age = ageMs(e, now);
    if (!Number.isFinite(age) || age < 0) continue;
    if (age >= WINDOW.intensity) break;
    if (actForEvent(e.event_type)) n++;
  }
  return Math.min(1, n / 12);
}

const plannedTitle = (p: PlannedEvent): string =>
  str(p.eventName) ?? str(p.summary) ?? str(p.title) ?? 'Untitled block';

/** Strip the "[Category] " prefix Hermes writes onto block titles. */
const cleanTitle = (t: string) => t.replace(/^\[[^\]]*\]\s*/, '');

/* ── The director ─────────────────────────────────────────────────────────*/

/**
 * Turn the live world into everything the 3D scene needs to render.
 *
 * Act priority, highest first:
 *   1. dormant     — the channel is down; nothing else matters
 *   2. voice       — the user is mid-conversation with ASAP RIGHT NOW
 *   3. alerting    — a failure inside WINDOW.alert
 *   4. presenting  — a fresh approval request inside WINDOW.present
 *   5. commending  — a win inside WINDOW.commend
 *   6. sustained   — the freshest work-in-flight inside WINDOW.sustain
 *   7. presenting  — nothing in flight, but approvals are waiting on you
 *   8. standby     — genuinely quiet
 *
 * Voice outranks everything except being offline, because it is the only input
 * where the user is actively waiting on a response. A background block landing
 * mid-sentence must not make the character look away from the person talking
 * to it.
 */
export function directScene(input: DirectorInput): SceneState {
  const {
    connected, events, pendingApprovals, activeAlerts,
    alertSeverity, plannedEvents = [], executedTitles = [], voice = null, now,
  } = input;

  const intensity = computeIntensity(events, now);

  /* ── which act ── */
  let act: Act;
  let driver: DirectorEvent | null = null;

  // 'transcribing' and 'thinking' both animate as `listening`: from the user's
  // side those are one continuous "it has my words and is working on them"
  // moment, and swapping motion twice inside ~2s reads as a twitch. The GLOW
  // still distinguishes them (see voiceGlow), because that is where the
  // waiting-for-Hermes signal actually belongs.
  const voiceAct: Act | null =
    !voice || voice.phase === 'idle' ? null
      : voice.phase === 'speaking' ? 'speaking'
        : 'listening';

  if (!connected) {
    act = 'dormant';
  } else if (voiceAct) {
    act = voiceAct;
  } else {
    const alertEv = freshest(events, now, WINDOW.alert, (a) => a === 'alerting');
    const presentEv = freshest(events, now, WINDOW.present, (a) => a === 'presenting');
    const commendEv = freshest(events, now, WINDOW.commend, (a) => a === 'commending');
    const workEv = freshest(events, now, WINDOW.sustain, (a) => SUSTAINED_ACTS.includes(a));

    if (alertEv) { act = 'alerting'; driver = alertEv; }
    else if (presentEv) { act = 'presenting'; driver = presentEv; }
    else if (commendEv) { act = 'commending'; driver = commendEv; }
    else if (workEv) { act = actForEvent(workEv.event_type)!; driver = workEv; }
    else if (pendingApprovals > 0) {
      // Nothing in flight, but work is waiting on YOU — so instead of idling he
      // turns and offers the stack. This is the whole point of the character.
      act = 'presenting';
    } else {
      act = 'standby';
    }
  }

  /* ── the beat ── */
  const lastMeaningful = driver ?? events.find((e) => actForEvent(e.event_type)) ?? null;
  let caption: string;
  if (act === 'dormant') {
    caption = 'Reconnecting to your workspace…';
  } else if (voiceAct) {
    caption =
      voice!.phase === 'listening' ? 'Go ahead — release to send.'
        : voice!.phase === 'transcribing' ? 'Getting that down…'
          : voice!.phase === 'thinking' ? 'Working on it…'
            : 'Speaking.';
  } else if (driver) {
    caption = summarise(driver);
  } else if (act === 'presenting') {
    caption = pendingApprovals === 1
      ? '1 draft is waiting on your decision.'
      : `${pendingApprovals} drafts are waiting on your decision.`;
  } else if (lastMeaningful) {
    caption = `Last: ${summarise(lastMeaningful)}`;
  } else {
    caption = 'Watching your calendar for the next block.';
  }

  const beat: Beat = {
    label: LABEL[act],
    caption,
    at: driver?.created_at ?? lastMeaningful?.created_at ?? null,
  };

  /* ── prop readouts ── */
  const executed = new Set(executedTitles.map((t) => cleanTitle(t).toLowerCase()));
  const board: BoardItem[] = plannedEvents.slice(0, 5).map((p) => {
    const title = cleanTitle(plannedTitle(p));
    return { title, done: executed.has(title.toLowerCase()) };
  });

  // Next block = the earliest planned event still in the future.
  let next: { title: string; at: string } | null = null;
  for (const p of plannedEvents) {
    const start = str(p.start);
    if (!start) continue;
    const t = Date.parse(start);
    if (!Number.isFinite(t) || t < now) continue;
    if (!next || t < Date.parse(next.at)) next = { title: cleanTitle(plannedTitle(p)), at: start };
  }

  const memoryWrites = events.filter((e) => {
    const a = actForEvent(e.event_type);
    return a === 'filing' || e.event_type === 'research.compiled';
  }).length;

  const severity: Readouts['phone']['severity'] =
    activeAlerts === 0 ? 'none' : (alertSeverity ?? 'info');

  const readouts: Readouts = {
    monitor: {
      heading: LABEL[act],
      body: caption,
      // 24-hour, zero-padded: this renders in JetBrains Mono on the in-world
      // monitor, where a "07:59 a.m." style stamp reads as chrome rather than
      // telemetry. hour12:false is required — en-CA defaults to 12-hour.
      stamp: beat.at
        ? new Date(beat.at).toLocaleTimeString('en-CA', {
            timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false,
          })
        : '--:--',
    },
    tray: { pending: pendingApprovals },
    board: { items: board },
    phone: { alerts: activeAlerts, severity },
    clock: { next },
    cabinet: { writes: memoryWrites },
  };

  /* ── what the user can do from inside the scene ── */
  const hotspots: Hotspot[] = [
    {
      id: 'tray',
      label: pendingApprovals > 0
        ? `Review ${pendingApprovals} draft${pendingApprovals === 1 ? '' : 's'}`
        : 'Nothing awaiting approval',
      count: pendingApprovals || undefined,
      actionable: pendingApprovals > 0, // approve/reject commits a real write
    },
    {
      id: 'phone',
      label: activeAlerts > 0
        ? `${activeAlerts} alert${activeAlerts === 1 ? '' : 's'} need attention`
        : 'No active alerts',
      count: activeAlerts || undefined,
      actionable: activeAlerts > 0, // acknowledge/snooze commits a real write
    },
    { id: 'board', label: "This week's blocks", count: board.length || undefined, actionable: false },
    { id: 'monitor', label: 'Watch it work', actionable: false },
    { id: 'cabinet', label: 'Long-term memory', count: memoryWrites || undefined, actionable: false },
  ];

  /* ── the edges ──
     Derived here, in the same pass, from the same act and the same clock the
     butler is about to be handed. Two projections of one object cannot drift. */
  const glow: Glow = !connected
    ? NO_GLOW
    : voiceAct
      ? glowForVoice(voice!.phase)
      : glowForAct(act, intensity, pendingApprovals);

  return { act, intensity, live: connected, beat, readouts, hotspots, glow };
}
