/* ═══════════════════════════════════════════════════════════════════════════
   Calendar — ASAP's own scheduling surface.

   Replaces Google Calendar as the STORE for ASAP's work. During the migration
   MSP/WSP keep writing Google and those events arrive here as
   source='google_import', visibly read-only, so nothing disappears mid-switch —
   see 19b_calendar_import.sql.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import { Button, Card, Skeleton } from '../components/ui';
import { PageShell } from './_shared';
import { Grid } from '../calendar/Grid';
import { EventEditor } from '../calendar/EventEditor';
import { useCalendar, viewRange } from '../calendar/useCalendar';
import { useClients } from '../hooks/useClients';
import type { CalendarView, Occurrence, CalendarEvent } from '../calendar/types';

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'agenda', label: 'Agenda' },
];

const CAL_COLOURS = ['#2C2A28', '#3D8B5D', '#496F95', '#C19932', '#B54230', '#7A5EA8'];

export default function Calendar() {
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [draftRange, setDraftRange] = useState<{ start: Date; end: Date } | null>(null);
  const [showCalendars, setShowCalendars] = useState(true);

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const cal = useCalendar(range);
  const { clients } = useClients();

  const step = (dir: 1 | -1) => {
    const d = new Date(anchor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else if (view === 'agenda') d.setDate(d.getDate() + 30 * dir);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const heading = useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', o).format(anchor);
    if (view === 'day') return f({ weekday: 'long', month: 'long', day: 'numeric' });
    if (view === 'month') return f({ month: 'long', year: 'numeric' });
    if (view === 'agenda') return 'Next 30 days';
    const end = new Date(range.to.getTime() - 86_400_000);
    return `${new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(range.from)} – ` +
      `${new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(end)}`;
  }, [view, anchor, range]);

  const handleSave = async (patch: Partial<CalendarEvent>, id?: string) => {
    const ok = id ? await cal.updateEvent(id, patch) : await cal.createEvent(patch);
    // Stay open on failure so the realtor can fix the time rather than losing
    // what they typed to a closed dialog.
    if (ok) { setEditing(null); setDraftRange(null); }
  };

  const handleMove = async (occ: Occurrence, newStart: Date) => {
    if (occ.event.source === 'google_import') return;
    const duration = occ.end.getTime() - occ.start.getTime();
    // Moving one occurrence of a series is an override, which needs the editor's
    // this-one-or-all question — so open it rather than guessing.
    if (occ.isRecurring) { setEditing(occ); return; }
    await cal.updateEvent(occ.event.id, {
      starts_at: newStart.toISOString(),
      ends_at: new Date(newStart.getTime() + duration).toISOString(),
    });
  };

  const dbBlindConflicts = cal.conflicts.filter((c) => c.dbCouldNotCatch);

  return (
    <PageShell
      title="Calendar"
      subtitle="ASAP’s scheduled work: research, preparation, follow-up drafts, and review. Client contact and publishing require approval."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="sm" icon={Plus} onClick={() => {
            const s = new Date();
            s.setMinutes(0, 0, 0);
            s.setHours(s.getHours() + 1);
            setDraftRange({ start: s, end: new Date(s.getTime() + 3_600_000) });
          }}>
            New task
          </Button>
        </div>
      }
    >
      {cal.error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/8 px-4 py-3 text-sm text-error">
          {cal.error}
        </div>
      )}

      {/* Only recurring clashes can reach this point — the exclusion constraint
          in migration 19 makes non-recurring ones impossible to store. Saying
          which kind these are is more useful than a generic warning. */}
      {dbBlindConflicts.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {dbBlindConflicts.length} overlapping repeat{dbBlindConflicts.length === 1 ? '' : 's'} in this view.
            </span>{' '}
            Recurring events are the one case the calendar cannot block automatically, so they are flagged here instead.
          </div>
        </div>
      )}

      {/* ── toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Previous"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => step(1)} aria-label="Next"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface">
            <ChevronRight size={18} />
          </button>
          <h2 className="text-lg font-bold text-text-primary ml-2">{heading}</h2>
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              aria-pressed={view === v.key}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${view === v.key ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_200px] gap-4 items-start">
        <div>
          {/* No "create a calendar first" step.
              An empty week IS a calendar, and it is the thing you opened the tab
              to look at. Migration 20 seeds a default per org and
              useCalendar.ensureDefaultCalendar() covers anything created since,
              so the grid renders regardless of whether a calendar row has
              caught up yet. */}
          {cal.loading ? (
            <Skeleton height="560px" rounded="lg" />
          ) : (
            <Grid
              view={view}
              anchor={anchor}
              from={range.from}
              to={range.to}
              occurrences={cal.occurrences}
              calendars={cal.calendars}
              conflicted={cal.conflicted}
              onOpen={setEditing}
              onCreateRange={(start, end) => setDraftRange({ start, end })}
              onMove={handleMove}
            />
          )}
        </div>

        {/* ── calendar list ── */}
        <aside className="lg:sticky lg:top-4">
          <Card padding="md">
            <button
              onClick={() => setShowCalendars(!showCalendars)}
              className="flex items-center justify-between w-full mb-2"
            >
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Calendars</span>
              {showCalendars ? <EyeOff size={13} className="text-text-tertiary" /> : <Eye size={13} className="text-text-tertiary" />}
            </button>

            {showCalendars && (
              <>
                <div className="space-y-1">
                  {cal.calendars.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => cal.toggleCalendar(c.id, !c.visible)}
                      className="flex items-center gap-2 w-full text-left py-1 group"
                    >
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 border"
                        style={{
                          background: c.visible ? c.colour : 'transparent',
                          borderColor: c.colour,
                        }}
                      />
                      <span className={`text-xs truncate ${c.visible ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => cal.createCalendar(
                    `ASAP · Work queue ${cal.calendars.length + 1}`,
                    'asap',
                    CAL_COLOURS[cal.calendars.length % CAL_COLOURS.length]
                  )}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-accent hover:opacity-80 mt-3"
                >
                  <Plus size={12} /> Add a calendar
                </button>
              </>
            )}
          </Card>

          <p className="text-[10px] text-text-tertiary mt-3 leading-relaxed px-1">
            Events ASAP created are marked. You can change or delete any of them —
            it will not put them back.
          </p>
        </aside>
      </div>

      {(editing || draftRange) && (
        <EventEditor
          occurrence={editing}
          draftRange={draftRange}
          calendars={cal.calendars}
          clients={clients}
          existing={cal.occurrences}
          saving={cal.saving}
          error={cal.error}
          onSave={handleSave}
          onDelete={async (id) => { await cal.deleteEvent(id); }}
          onDeleteOccurrence={async (ev, start) => { await cal.deleteOccurrence(ev, start); }}
          onClose={() => { setEditing(null); setDraftRange(null); }}
        />
      )}
    </PageShell>
  );
}
