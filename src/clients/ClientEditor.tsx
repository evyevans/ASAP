/* ═══════════════════════════════════════════════════════════════════════════
   ClientEditor — one buyer's brief.

   WHAT IS DELIBERATELY ABSENT: email, phone, mailing address.
   success-criteria/10-explicit-non-goals.md SC-10.5 — "Client PII stays in the
   CRM and the single approved Supabase project. No new store duplicates it."
   Follow Up Boss stays authoritative for contact details. What lives here is
   the buying brief, which FUB has nowhere to put and which is the thing ASAP
   actually needs to do its job. The `fub_person_id` field is the join.

   Migration 17 has a verification query (V5) that fails if an email or phone
   column ever appears on asap_clients. This form is the other half of that
   rule: no field here can create one.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import {
  User, Wallet, Quote, Handshake, AlertTriangle, Save, RotateCcw, Trash2,
} from 'lucide-react';
import { Button, Card, Input } from '../components/ui';
import { SectionTitle } from '../pages/_shared';
import { CriteriaEditor, ConfirmAllButton } from './CriteriaEditor';
import {
  STATUS_LABEL, TIMELINE_LABEL, REPRESENTATION_LABEL, confirmedAge, isStale, money,
} from './clientCopy';
import type {
  Client, ClientContext, ClientStatus, ClientTimeline, Representation, MarketRow,
} from '../matching/types';
import type { Criterion, ClientGeography } from '../matching/types';

const STATUSES = Object.keys(STATUS_LABEL) as ClientStatus[];
const TIMELINES = Object.keys(TIMELINE_LABEL) as ClientTimeline[];
const REPRESENTATIONS = Object.keys(REPRESENTATION_LABEL) as Representation[];

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      {help && <p className="text-[11px] text-text-tertiary mt-0.5">{help}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Select<T extends string>({
  value, onChange, options, labels, ariaLabel,
}: {
  value: T; onChange: (v: T) => void; options: T[]; labels: Record<T, string>; ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
    >
      {options.map((o) => <option key={o} value={o}>{labels[o]}</option>)}
    </select>
  );
}

function TextArea({
  value, onChange, placeholder, rows = 5, limit,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; rows?: number; limit: number;
}) {
  const near = value.length >= limit * 0.9;
  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={limit}
        placeholder={placeholder}
        className="w-full max-h-72 overflow-y-auto bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary leading-relaxed outline-none focus:border-accent resize-y placeholder:text-text-tertiary"
      />
      <div className={`mt-1 text-right text-[11px] tabular-nums ${near ? 'text-warning' : 'text-text-tertiary'}`}>
        {value.length.toLocaleString()} / {limit.toLocaleString()}
      </div>
    </>
  );
}

/** A dated freshness note. The whole staleness defence is that this is always
 *  on screen rather than something you have to go looking for. */
function Freshness({ iso, staleDays, what }: { iso: string | null; staleDays: number; what: string }) {
  const stale = isStale(iso, staleDays);
  return (
    <span className={`text-[11px] ${stale ? 'text-warning font-medium' : 'text-text-tertiary'}`}>
      {what} {confirmedAge(iso)}
    </span>
  );
}

export interface ClientEditorProps {
  context: ClientContext;
  markets: MarketRow[];
  staleDays: number;
  saving: boolean;
  error: string | null;
  onSave: (patch: Partial<Client>) => void;
  onDelete: () => void;
  onConfirmAll: () => void;
  onAddCriterion: (d: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onUpdateCriterion: (id: string, patch: Partial<Criterion>) => void;
  onRemoveCriterion: (id: string) => void;
  onAddGeography: (d: Omit<ClientGeography, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onRemoveGeography: (id: string) => void;
  /**
   * Hide the name / FUB-id / status fields.
   *
   * Set when this editor is rendered underneath a FubPersonCard, which already
   * shows all of them from the CRM. Two editable copies of a client's name is
   * how ASAP and Follow Up Boss start disagreeing about who someone is — FUB
   * owns identity, this owns the buying brief.
   *
   * Representation and timeline stay visible either way: TRESA status and
   * urgency are ASAP's own fields, not FUB's.
   */
  hideIdentity?: boolean;
}

export function ClientEditor(p: ClientEditorProps) {
  const { client } = p.context;
  const [draft, setDraft] = useState<Client>(client);

  // Re-seed when a different client is selected, or when a save round-trips.
  useEffect(() => { setDraft(client); }, [client]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(client);
  const set = (patch: Partial<Client>) => setDraft((d) => ({ ...d, ...patch }));

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  // One clock read per mount. An expiry measured in days does not need
  // re-evaluating on every keystroke, and reading it during render makes the
  // component non-idempotent.
  const [now] = useState(() => Date.now());
  const preapprovalExpired = Boolean(
    draft.preapproved && draft.preapproval_expires_at &&
    Date.parse(draft.preapproval_expires_at) < now
  );

  return (
    <div>
      {/* ── header ──
          Under a FubPersonCard the name is already on screen a few pixels above,
          so repeating it is noise. The freshness stamps and the save controls
          are not — those belong to the brief. */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          {!p.hideIdentity && (
            <h2 className="text-xl font-black text-text-primary tracking-tight truncate">
              {draft.display_name || 'Unnamed client'}
            </h2>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Freshness iso={client.criteria_confirmed_at} staleDays={p.staleDays} what="Brief" />
            <Freshness iso={client.budget_confirmed_at} staleDays={p.staleDays} what="Budget" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ConfirmAllButton onConfirm={p.onConfirmAll} saving={p.saving} />
          <Button variant="secondary" size="sm" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft(client)}>
            Reset
          </Button>
          <Button size="sm" icon={Save} loading={p.saving} disabled={!dirty} onClick={() => p.onSave(draft)}>
            Save
          </Button>
        </div>
      </div>

      {p.error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/8 px-4 py-3 text-sm text-error">
          {p.error}
        </div>
      )}

      {/* Compliance first, because it changes what ASAP may do for this person
          at all — TRESA representation is not a footnote. */}
      {draft.representation !== 'buyer_rep_signed' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {REPRESENTATION_LABEL[draft.representation]}.
            </span>{' '}
            ASAP will still research and shortlist for them — nothing goes to the client without your approval either way.
          </p>
        </div>
      )}

      {/* ── who they are ──
          Under a FUB card, name / FUB-id / status are already shown and owned
          by the CRM, so only the fields ASAP actually owns remain: how urgent
          the search is, and whether a written representation agreement exists.
          Two editable copies of a client's name is how two systems start
          disagreeing about who someone is. */}
      <SectionTitle icon={User} title={p.hideIdentity ? 'Working relationship' : 'Who they are'} />
      <Card padding="lg">
        <div className="grid md:grid-cols-2 gap-5">
          {!p.hideIdentity && (
            <>
              <Field label="Name">
                <Input value={draft.display_name} onChange={(e) => set({ display_name: e.target.value })} />
              </Field>
              <Field label="Follow Up Boss ID" help="Contact details stay in FUB — this is just the link.">
                <Input
                  value={draft.fub_person_id ?? ''}
                  placeholder="optional"
                  onChange={(e) => set({ fub_person_id: e.target.value.trim() || null })}
                />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(v) => set({ status: v })}
                  options={STATUSES} labels={STATUS_LABEL} ariaLabel="Client status" />
              </Field>
            </>
          )}
          <Field label="Timeline">
            <Select value={draft.timeline ?? 'exploring'} onChange={(v) => set({ timeline: v })}
              options={TIMELINES} labels={TIMELINE_LABEL} ariaLabel="Buying timeline" />
          </Field>
          <Field label="Representation" help="TRESA — whether a written buyer agreement is in place.">
            <Select value={draft.representation} onChange={(v) => set({ representation: v })}
              options={REPRESENTATIONS} labels={REPRESENTATION_LABEL} ariaLabel="Representation status" />
          </Field>
          <Field label="Agreement expires">
            <Input type="date" value={draft.representation_expires_at ?? ''}
              onChange={(e) => set({ representation_expires_at: e.target.value || null })} />
          </Field>
        </div>
      </Card>

      {/* ── money ── */}
      <SectionTitle icon={Wallet} title="Budget & financing" hint="the hard ceiling on every match" />
      <Card padding="lg">
        <div className="grid md:grid-cols-3 gap-5">
          <Field label="Budget from">
            <Input type="number" value={draft.budget_min ?? ''}
              onChange={(e) => set({ budget_min: num(e.target.value) })} />
          </Field>
          <Field label="Budget to">
            <Input type="number" value={draft.budget_max ?? ''}
              onChange={(e) => set({ budget_max: num(e.target.value) })} />
          </Field>
          <Field
            label="Stretch %"
            help="How far above the ceiling ASAP may still show them. 0 = never."
          >
            <Input type="number" min={0} max={25} value={draft.budget_stretch_pct}
              onChange={(e) => set({ budget_stretch_pct: Number(e.target.value) || 0 })} />
          </Field>
        </div>

        {draft.budget_max !== null && (
          <p className="text-[11px] text-text-tertiary mt-3">
            Nothing above{' '}
            <span className="font-semibold text-text-secondary">
              {money(draft.budget_max * (1 + (draft.budget_stretch_pct || 0) / 100))}
            </span>{' '}
            will be matched to them.
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-5 mt-5 pt-5 border-t border-border">
          <Field label="Pre-approved?">
            <button
              onClick={() => set({ preapproved: !draft.preapproved })}
              className="flex items-center gap-2 text-sm text-text-primary"
            >
              <span className={`w-9 h-5 rounded-full shrink-0 transition-colors relative ${draft.preapproved ? 'bg-accent' : 'bg-border'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${draft.preapproved ? 'left-4' : 'left-0.5'}`} />
              </span>
              {draft.preapproved ? 'Yes' : 'Not yet'}
            </button>
          </Field>
          <Field label="Pre-approved for">
            <Input type="number" value={draft.preapproval_amount ?? ''}
              disabled={!draft.preapproved}
              onChange={(e) => set({ preapproval_amount: num(e.target.value) })} />
          </Field>
          <Field label="Expires">
            <Input type="date" value={draft.preapproval_expires_at ?? ''}
              disabled={!draft.preapproved}
              onChange={(e) => set({ preapproval_expires_at: e.target.value || null })} />
          </Field>
        </div>

        {preapprovalExpired && (
          <p className="mt-3 text-xs text-warning font-medium">
            Their pre-approval has expired — ASAP treats the whole budget as unconfirmed until it is renewed.
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <Field label="Down payment">
            <Input type="number" value={draft.down_payment ?? ''}
              onChange={(e) => set({ down_payment: num(e.target.value) })} />
          </Field>
          <Field label="Financing notes">
            <Input value={draft.financing_notes ?? ''}
              placeholder="e.g. gift from parents landing in September"
              onChange={(e) => set({ financing_notes: e.target.value || null })} />
          </Field>
        </div>
      </Card>

      {/* ── criteria + geography ── */}
      <CriteriaEditor
        criteria={p.context.criteria}
        geography={p.context.geography}
        markets={p.markets}
        staleDays={p.staleDays}
        onAddCriterion={p.onAddCriterion}
        onUpdateCriterion={p.onUpdateCriterion}
        onRemoveCriterion={p.onRemoveCriterion}
        onAddGeography={p.onAddGeography}
        onRemoveGeography={p.onRemoveGeography}
      />

      {/* ── their words ── */}
      <SectionTitle icon={Quote} title="Client voice" hint="in their own words — ASAP reads this for nuance" />
      <Card padding="lg">
        <p className="text-[11px] text-text-tertiary mb-2">
          The context a checkbox cannot hold. ASAP uses this to sanity-check matches that
          tick every box but would not actually suit them.
        </p>
        <TextArea
          value={draft.client_voice ?? ''}
          onChange={(v) => set({ client_voice: v || null })}
          limit={2000}
          rows={6}
          placeholder={'e.g. "We got outbid twice and we\'re exhausted. Sarah works from home so the second bedroom really has to be a real room, not a den. They both hated the last place because it backed onto Kingston Rd — noise is a bigger deal than they first said."'}
        />
      </Card>

      <SectionTitle icon={Handshake} title="How they like to work" />
      <Card padding="lg">
        <TextArea
          value={draft.process_notes ?? ''}
          onChange={(v) => set({ process_notes: v || null })}
          limit={1500}
          rows={4}
          placeholder="e.g. Text, never call. Only free for showings after 6pm and Saturdays. Wants to see everything before offering — no rush deals."
        />
      </Card>

      <div className="mt-10 pt-6 border-t border-border">
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          onClick={() => {
            if (confirm(`Delete ${client.display_name}? Their brief, areas and matches go with them.`)) {
              p.onDelete();
            }
          }}
        >
          Delete this client
        </Button>
      </div>
    </div>
  );
}
