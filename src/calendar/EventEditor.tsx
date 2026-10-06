/* ═══════════════════════════════════════════════════════════════════════════
   EventEditor — create and edit, including the two hard cases.

   HARD CASE 1: EDITING ONE OCCURRENCE OF A SERIES.
   "Delete" on a recurring event is ambiguous, and guessing wrong is expensive —
   removing every future Tuesday when the realtor meant to cancel one is not
   recoverable by undo, because the series has no undo. So the dialog asks, and
   deleting a single occurrence writes an EXDATE rather than removing the row.

   HARD CASE 2: CONFLICTS.
   The database will refuse an overlapping busy event (migration 19's exclusion
   constraint), which is the real guarantee. But being told AFTER pressing save
   is a bad experience, so the editor checks as you type and warns while the
   time is still easy to change. The check and the constraint use the same
   half-open bound, so they can never disagree.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Save, AlertTriangle, Repeat, Lock } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { RECURRENCE_PRESETS, describeRrule } from './recurrence';
import { wouldConflict } from './conflicts';
import type { CalendarEvent, CalendarRow, Occurrence } from './types';
import type { Client } from '../matching/types';

/** <input type="datetime-local"> speaks local wall time with no zone. These two
 *  convert without going through UTC, so a 9am event edits as 9am. */
const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (s: string): Date => new Date(s);

export interface EventEditorProps {
  /** The occurrence being edited, or null when creating. */
  occurrence: Occurrence | null;
  /** Prefill for a new event, from a drag on the grid. */
  draftRange: { start: Date; end: Date } | null;
  calendars: CalendarRow[];
  clients: Client[];
  existing: Occurrence[];
  saving: boolean;
  error: string | null;
  onSave: (patch: Partial<CalendarEvent>, id?: string) => void;
  onDelete: (id: string) => void;
  onDeleteOccurrence: (event: CalendarEvent, start: Date) => void;
  onClose: () => void;
}

export function EventEditor({
  occurrence, draftRange, calendars, clients, existing,
  saving, error, onSave, onDelete, onDeleteOccurrence, onClose,
}: EventEditorProps) {
  const editing = occurrence?.event ?? null;
  const isNew = !editing;

  // Imported events are somebody else's record. Migration 19's ownership
  // trigger governs the AGENT; this governs the UI, so an imported Google event
  // is visibly read-only rather than failing on save.
  const readOnly = editing?.source === 'google_import';

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [calendarId, setCalendarId] = useState(
    editing?.calendar_id ?? calendars.find((c) => c.is_default)?.id ?? calendars[0]?.id ?? ''
  );
  // Lazy initialisers: the clock is read once when the dialog opens, not on
  // every render. An eagerly-evaluated `new Date()` in a useState argument is
  // recomputed each render and thrown away, which is wasteful and — for the
  // "+1 hour" default below — subtly wrong, since the discarded value would
  // drift while the dialog is open.
  const [start, setStart] = useState<Date>(
    () => occurrence?.start ?? draftRange?.start ?? new Date()
  );
  const [end, setEnd] = useState<Date>(
    () => occurrence?.end ?? draftRange?.end ?? new Date(Date.now() + 3_600_000)
  );
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [rrule, setRrule] = useState(editing?.rrule ?? '');
  const [clientId, setClientId] = useState(editing?.client_id ?? '');
  const [busy, setBusy] = useState(editing?.busy ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Live conflict check. Same half-open comparison the exclusion constraint
   * uses, so a warning here always means the database would refuse it too. */
  const clashes = useMemo(() => {
    if (allDay || !busy) return [];
    return wouldConflict(
      { start, end, calendarId, ignoreEventId: editing?.id },
      existing
    );
  }, [start, end, calendarId, allDay, busy, existing, editing?.id]);

  const submit = () => {
    if (!title.trim()) return;

    const patch: Partial<CalendarEvent> = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      calendar_id: calendarId,
      busy,
      client_id: clientId || null,
      rrule: rrule || null,
      ...(allDay
        ? {
          all_day: true,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          starts_at: null,
          ends_at: null,
        }
        : {
          all_day: false,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          start_date: null,
          end_date: null,
        }),
    };

    onSave(patch, editing?.id);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-bg-dark/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'New event' : 'Edit event'}
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">
            {isNew ? 'New event' : readOnly ? 'Event (read-only)' : 'Edit event'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-text-tertiary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-error/30 bg-error/8 px-4 py-2.5 text-sm text-error">
              {error}
            </div>
          )}

          {readOnly && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-bg-elevated px-4 py-2.5">
              <Lock size={14} className="text-text-tertiary mt-0.5 shrink-0" />
              <p className="text-xs text-text-secondary">
                Imported from Google Calendar. Change it there, or recreate it here.
              </p>
            </div>
          )}

          {editing?.source === 'asap' && (
            <div className="rounded-xl border border-accent/25 bg-accent/6 px-4 py-2.5">
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">ASAP scheduled this.</span>{' '}
                You can change or remove it — it will not put it back.
              </p>
            </div>
          )}

          <Input
            placeholder="What is it?"
            value={title}
            disabled={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => !readOnly && setAllDay(!allDay)}
              disabled={readOnly}
              className="flex items-center gap-2 text-xs text-text-secondary"
            >
              <span className={`w-8 h-4.5 rounded-full shrink-0 transition-colors relative ${allDay ? 'bg-accent' : 'bg-border'}`}
                style={{ height: 18 }}>
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${allDay ? 'left-4' : 'left-0.5'}`} />
              </span>
              All day
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-text-secondary">Starts</label>
              <Input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? start.toISOString().slice(0, 10) : toLocalInput(start)}
                disabled={readOnly}
                onChange={(e) => {
                  const d = allDay ? new Date(`${e.target.value}T00:00`) : fromLocalInput(e.target.value);
                  if (!Number.isNaN(d.getTime())) {
                    // Keep the duration when the start moves — otherwise every
                    // reschedule silently becomes a different-length meeting.
                    const dur = end.getTime() - start.getTime();
                    setStart(d);
                    setEnd(new Date(d.getTime() + Math.max(dur, 0)));
                  }
                }}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-secondary">Ends</label>
              <Input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? end.toISOString().slice(0, 10) : toLocalInput(end)}
                disabled={readOnly}
                onChange={(e) => {
                  const d = allDay ? new Date(`${e.target.value}T00:00`) : fromLocalInput(e.target.value);
                  if (!Number.isNaN(d.getTime())) setEnd(d);
                }}
              />
            </div>
          </div>

          {end <= start && !allDay && (
            <p className="text-xs text-error">It has to end after it starts.</p>
          )}

          {/* The warning that arrives while the time is still easy to change. */}
          {clashes.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/8 px-4 py-2.5">
              <AlertTriangle size={14} className="text-error mt-0.5 shrink-0" />
              <div className="text-xs text-text-secondary">
                <span className="font-semibold text-error">
                  Clashes with {clashes.length === 1 ? '' : `${clashes.length} events, including `}
                  "{clashes[0].event.title}".
                </span>
                <br />
                This calendar will not accept two things at once — move one of them first.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-text-secondary">Calendar</label>
              <select
                value={calendarId}
                disabled={readOnly}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full mt-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                <Repeat size={11} /> Repeats
              </label>
              <select
                value={RECURRENCE_PRESETS.find((p) => p.rrule === (rrule || null))?.key ?? 'custom'}
                disabled={readOnly}
                onChange={(e) => {
                  const p = RECURRENCE_PRESETS.find((x) => x.key === e.target.value);
                  setRrule(p?.rrule ?? '');
                }}
                className="w-full mt-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {RECURRENCE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                {/* Anything not in the presets keeps its rule rather than being
                    silently reset to "does not repeat" on the next save. */}
                {!RECURRENCE_PRESETS.some((p) => p.rrule === (rrule || null)) && (
                  <option value="custom">{describeRrule(rrule)}</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-text-secondary">For a client (optional)</label>
            <select
              value={clientId}
              disabled={readOnly}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full mt-1 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>

          <Input placeholder="Where?" value={location} disabled={readOnly}
            onChange={(e) => setLocation(e.target.value)} />

          <textarea
            placeholder="Notes"
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent resize-y placeholder:text-text-tertiary"
          />

          <button
            onClick={() => !readOnly && setBusy(!busy)}
            disabled={readOnly}
            className="flex items-center gap-2 text-xs text-text-secondary"
          >
            <span className={`w-8 rounded-full shrink-0 transition-colors relative ${busy ? 'bg-accent' : 'bg-border'}`}
              style={{ height: 18 }}>
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${busy ? 'left-4' : 'left-0.5'}`} />
            </span>
            {busy ? 'Blocks my time' : 'Free — does not block'}
          </button>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-2">
          <div>
            {editing && !readOnly && (
              confirmDelete ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* The ambiguous case, asked rather than guessed. */}
                  {occurrence?.isRecurring ? (
                    <>
                      <Button variant="danger" size="sm"
                        onClick={() => { onDeleteOccurrence(editing, occurrence.start); onClose(); }}>
                        Just this one
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => { onDelete(editing.id); onClose(); }}>
                        Whole series
                      </Button>
                    </>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => { onDelete(editing.id); onClose(); }}>
                      Delete
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )
            )}
          </div>

          {!readOnly && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm" icon={Save} loading={saving}
                disabled={!title.trim() || (!allDay && end <= start)}
                onClick={submit}
              >
                {isNew ? 'Create' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
