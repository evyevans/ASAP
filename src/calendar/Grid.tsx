/* ═══════════════════════════════════════════════════════════════════════════
   Grid — month, week, day and agenda.

   DRAG BEHAVIOUR
   Drag-to-create and drag-to-move are implemented on the time grid with
   pointer events rather than HTML5 drag-and-drop: HTML5 DnD cannot report a
   continuous position, so a drag would snap between drop targets instead of
   following the cursor. Everything snaps to 15 minutes, which is what a
   showing is actually scheduled to.

   WHAT IS DELIBERATELY NOT HERE
   No Google chrome. The brief asks for Google's BEHAVIOUR — create, edit, drag,
   recurring, multiple calendars, views, reminders — inside ASAP's own visual
   language. So this uses the same tokens, cards and type scale as the rest of
   the product; it does not try to look like somebody else's calendar.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, Repeat, User } from 'lucide-react';
import type { Occurrence, CalendarRow, CalendarView } from './types';

const HOUR_PX = 48;
const DAY_START_HOUR = 6;   // a realtor's day, not midnight-to-midnight
const DAY_END_HOUR = 23;
const SNAP_MINUTES = 15;

const MS_MIN = 60_000;

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
    .replace(':00', '').toLowerCase();

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const isToday = (d: Date) => sameDay(d, new Date());

const daysBetween = (from: Date, to: Date): Date[] => {
  const out: Date[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cur < to) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

/* ── one event block ──────────────────────────────────────────────────────*/

function EventBlock({
  occ, calendar, conflicted, compact, onOpen,
}: {
  occ: Occurrence;
  calendar?: CalendarRow;
  conflicted: boolean;
  compact?: boolean;
  onOpen: (o: Occurrence) => void;
}) {
  const colour = calendar?.colour ?? '#2C2A28';
  // The realtor may edit their own events freely; ASAP's are theirs too but
  // marked, so it is obvious what the agent put there.
  const agentOwned = occ.event.source === 'asap';
  const locked = occ.event.source === 'google_import';

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(occ); }}
      title={`${occ.event.title} · ${fmtTime(occ.start)}–${fmtTime(occ.end)}`}
      className={`w-full text-left rounded-md px-1.5 py-1 overflow-hidden transition-shadow
        ${compact ? 'text-[10px] leading-tight' : 'text-[11px]'}
        ${conflicted ? 'ring-2 ring-error/60' : ''}
        hover:shadow-md`}
      style={{
        background: `color-mix(in srgb, ${colour} 16%, var(--color-bg-surface))`,
        borderLeft: `3px solid ${colour}`,
      }}
    >
      <div className="flex items-center gap-1">
        {conflicted && <AlertTriangle size={9} className="text-error shrink-0" />}
        {occ.isRecurring && <Repeat size={9} className="opacity-50 shrink-0" />}
        {agentOwned && <span className="text-[8px] font-bold opacity-60 shrink-0">ASAP</span>}
        {locked && <Lock size={9} className="opacity-50 shrink-0" />}
        <span className="font-semibold text-text-primary truncate">{occ.event.title}</span>
      </div>
      {!compact && (
        <div className="text-text-tertiary truncate">
          {fmtTime(occ.start)}
          {occ.event.client_id && <User size={8} className="inline ml-1 -mt-0.5" />}
        </div>
      )}
    </button>
  );
}

/* ── month ────────────────────────────────────────────────────────────────*/

function MonthGrid({
  from, to, anchor, occurrences, calendars, conflicted, onOpen, onCreateAt,
}: {
  from: Date; to: Date; anchor: Date;
  occurrences: Occurrence[];
  calendars: CalendarRow[];
  conflicted: Set<string>;
  onOpen: (o: Occurrence) => void;
  onCreateAt: (start: Date) => void;
}) {
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const k = o.start.toDateString();
      (m.get(k) ?? m.set(k, []).get(k)!).push(o);
    }
    return m;
  }, [occurrences]);

  return (
    <div className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const items = (byDay.get(day.toDateString()) ?? []).slice(0, 4);
          const overflow = (byDay.get(day.toDateString()) ?? []).length - items.length;
          return (
            <div
              key={day.toISOString()}
              onClick={() => onCreateAt(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0))}
              className={`min-h-[104px] border-b border-r border-border p-1.5 cursor-pointer transition-colors
                hover:bg-bg-elevated ${inMonth ? '' : 'opacity-40'}`}
            >
              <div className={`text-[11px] mb-1 tabular-nums ${
                isToday(day)
                  ? 'font-black text-text-on-accent bg-accent rounded-full w-5 h-5 flex items-center justify-center'
                  : 'text-text-tertiary'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {items.map((o) => (
                  <EventBlock key={o.key} occ={o} calendar={calById.get(o.event.calendar_id)}
                    conflicted={conflicted.has(o.key)} compact onOpen={onOpen} />
                ))}
                {overflow > 0 && (
                  <div className="text-[10px] text-text-tertiary pl-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── week / day ───────────────────────────────────────────────────────────*/

function TimeGrid({
  from, to, occurrences, calendars, conflicted, onOpen, onCreateRange, onMove,
}: {
  from: Date; to: Date;
  occurrences: Occurrence[];
  calendars: CalendarRow[];
  conflicted: Set<string>;
  onOpen: (o: Occurrence) => void;
  onCreateRange: (start: Date, end: Date) => void;
  onMove: (occ: Occurrence, newStart: Date) => void;
}) {
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const hours = useMemo(
    () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i),
    []
  );

  const colRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ day: Date; fromMin: number; toMin: number } | null>(null);
  const [moving, setMoving] = useState<{ occ: Occurrence; offsetMin: number } | null>(null);

  /** Pixel offset within a column → minutes past DAY_START_HOUR, snapped. */
  const minutesAt = useCallback((clientY: number, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return snap((px / HOUR_PX) * 60) + DAY_START_HOUR * 60;
  }, []);

  const dateAt = (day: Date, minutes: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);

  const onPointerDown = (day: Date) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = minutesAt(e.clientY, e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ day, fromMin: m, toMin: m + SNAP_MINUTES });
  };

  const onPointerMove = (day: Date) => (e: React.PointerEvent<HTMLDivElement>) => {
    const m = minutesAt(e.clientY, e.currentTarget);
    if (moving) return;
    if (drag && sameDay(drag.day, day)) setDrag({ ...drag, toMin: m });
  };

  const onPointerUp = (day: Date) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (moving) {
      const m = minutesAt(e.clientY, e.currentTarget);
      onMove(moving.occ, dateAt(day, m - moving.offsetMin));
      setMoving(null);
      setDrag(null);
      return;
    }
    if (!drag) return;
    const a = Math.min(drag.fromMin, drag.toMin);
    const b = Math.max(drag.fromMin, drag.toMin);
    // A click, not a drag: default to a one-hour block rather than a zero-
    // length event nobody wanted.
    const end = b - a < SNAP_MINUTES * 2 ? a + 60 : b;
    onCreateRange(dateAt(day, a), dateAt(day, end));
    setDrag(null);
  };

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;

  return (
    <div className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
      {/* day headers */}
      <div className="flex border-b border-border">
        <div className="w-14 shrink-0" />
        {days.map((d) => (
          <div key={d.toISOString()} className="flex-1 px-2 py-2 text-center border-l border-border">
            <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
              {new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(d)}
            </div>
            <div className={`text-sm tabular-nums ${isToday(d) ? 'font-black text-accent' : 'text-text-primary'}`}>
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex overflow-y-auto" style={{ maxHeight: 620 }}>
        {/* hour gutter */}
        <div className="w-14 shrink-0">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_PX }}
              className="text-[10px] text-text-tertiary text-right pr-2 -mt-1.5 tabular-nums">
              {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayOccs = occurrences.filter((o) => sameDay(o.start, day) && !o.allDay);
          return (
            <div
              key={day.toISOString()}
              ref={colRef}
              onPointerDown={onPointerDown(day)}
              onPointerMove={onPointerMove(day)}
              onPointerUp={onPointerUp(day)}
              className="flex-1 relative border-l border-border cursor-crosshair select-none"
              style={{ height: gridHeight }}
            >
              {/* hour lines */}
              {hours.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: (h - DAY_START_HOUR) * HOUR_PX }} />
              ))}

              {/* events */}
              {dayOccs.map((o) => {
                const startMin = o.start.getHours() * 60 + o.start.getMinutes();
                const endMin = o.end.getHours() * 60 + o.end.getMinutes();
                const top = ((startMin - DAY_START_HOUR * 60) / 60) * HOUR_PX;
                const height = Math.max(18, ((endMin - startMin) / 60) * HOUR_PX - 2);
                return (
                  <div
                    key={o.key}
                    className="absolute left-1 right-1"
                    style={{ top, height }}
                    onPointerDown={(e) => {
                      // Grab an event to move it. Only rows the realtor may
                      // change — imported ones are locked, matching the
                      // ownership trigger in migration 19.
                      if (o.event.source === 'google_import') return;
                      e.stopPropagation();
                      const el = e.currentTarget.parentElement as HTMLElement;
                      const m = minutesAt(e.clientY, el);
                      setMoving({ occ: o, offsetMin: m - startMin });
                    }}
                  >
                    <div className="h-full">
                      <EventBlock occ={o} calendar={calById.get(o.event.calendar_id)}
                        conflicted={conflicted.has(o.key)} onOpen={onOpen} />
                    </div>
                  </div>
                );
              })}

              {/* live drag preview */}
              {drag && sameDay(drag.day, day) && !moving && (
                <div
                  className="absolute left-1 right-1 rounded-md border-2 border-dashed border-accent bg-accent/10 pointer-events-none"
                  style={{
                    top: ((Math.min(drag.fromMin, drag.toMin) - DAY_START_HOUR * 60) / 60) * HOUR_PX,
                    height: Math.max(
                      12,
                      (Math.abs(drag.toMin - drag.fromMin) / 60) * HOUR_PX
                    ),
                  }}
                />
              )}

              {/* now line */}
              {isToday(day) && <NowLine />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < DAY_START_HOUR * 60 || min > DAY_END_HOUR * 60) return null;
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10"
      style={{ top: ((min - DAY_START_HOUR * 60) / 60) * HOUR_PX }}
      aria-hidden
    >
      <div className="h-px bg-error" />
      <div className="w-1.5 h-1.5 rounded-full bg-error -mt-[3px]" />
    </div>
  );
}

/* ── agenda ───────────────────────────────────────────────────────────────*/

function Agenda({
  occurrences, calendars, conflicted, onOpen,
}: {
  occurrences: Occurrence[];
  calendars: CalendarRow[];
  conflicted: Set<string>;
  onOpen: (o: Occurrence) => void;
}) {
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);

  const grouped = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const k = o.start.toDateString();
      (m.get(k) ?? m.set(k, []).get(k)!).push(o);
    }
    return [...m.entries()];
  }, [occurrences]);

  if (grouped.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface px-6 py-10 text-center text-sm text-text-secondary">
        Nothing scheduled in the next 30 days.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([day, items]) => (
        <div key={day} className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-bg-elevated/50">
            <span className="text-xs font-bold text-text-primary">
              {new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })
                .format(new Date(day))}
            </span>
          </div>
          <div className="p-2 space-y-1">
            {items.map((o) => (
              <div key={o.key} className="flex items-center gap-3">
                <span className="text-[11px] text-text-tertiary tabular-nums w-24 shrink-0">
                  {o.allDay ? 'All day' : `${fmtTime(o.start)}–${fmtTime(o.end)}`}
                </span>
                <div className="flex-1 min-w-0">
                  <EventBlock occ={o} calendar={calById.get(o.event.calendar_id)}
                    conflicted={conflicted.has(o.key)} onOpen={onOpen} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── the grid ─────────────────────────────────────────────────────────────*/

export interface GridProps {
  view: CalendarView;
  anchor: Date;
  from: Date;
  to: Date;
  occurrences: Occurrence[];
  calendars: CalendarRow[];
  conflicted: Set<string>;
  onOpen: (o: Occurrence) => void;
  onCreateRange: (start: Date, end: Date) => void;
  onMove: (occ: Occurrence, newStart: Date) => void;
}

export function Grid(p: GridProps) {
  if (p.view === 'month') {
    return (
      <MonthGrid
        from={p.from} to={p.to} anchor={p.anchor}
        occurrences={p.occurrences} calendars={p.calendars} conflicted={p.conflicted}
        onOpen={p.onOpen}
        onCreateAt={(start) => p.onCreateRange(start, new Date(start.getTime() + 60 * MS_MIN))}
      />
    );
  }
  if (p.view === 'agenda') {
    return (
      <Agenda occurrences={p.occurrences} calendars={p.calendars}
        conflicted={p.conflicted} onOpen={p.onOpen} />
    );
  }
  return (
    <TimeGrid
      from={p.from} to={p.to}
      occurrences={p.occurrences} calendars={p.calendars} conflicted={p.conflicted}
      onOpen={p.onOpen} onCreateRange={p.onCreateRange} onMove={p.onMove}
    />
  );
}

