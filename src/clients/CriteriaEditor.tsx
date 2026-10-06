/* ═══════════════════════════════════════════════════════════════════════════
   CriteriaEditor — must-haves, nice-to-haves, deal-breakers, and geography.

   THE DESIGN PROBLEM
   The data model underneath is (field, op, value, weight) — precise, and
   completely unusable as a form. A realtor asked to pick "bedrooms / gte / 3"
   will close the tab. So the model never appears: they pick from a list of
   things buyers actually say ("Minimum bedrooms"), fill in one number, and the
   preset supplies field, op and the sentence that will be read back later.
   See clientCopy.ts CRITERION_PRESETS.

   WHY EACH ROW SHOWS ITS AGE
   The brief's first named risk is stale preference data, and staleness is
   invisible by nature — a criterion from March looks exactly like one from
   this morning. Putting the age on every row is what makes it visible, and the
   match engine bands down anything older than the configured window, so the
   badge and the behaviour agree.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { Plus, Trash2, MapPin, Ban, ShieldAlert, Check } from 'lucide-react';
import { Button, Card, Chip, Input } from '../components/ui';
import { SectionTitle } from '../pages/_shared';
import {
  CRITERION_PRESETS, KIND_LABEL, KIND_HELP,
  confirmedAge, isStale, type CriterionPreset,
} from './clientCopy';
import type {
  Criterion, ClientGeography, CriterionKind, MarketRow,
} from '../matching/types';

/* ── Criteria ─────────────────────────────────────────────────────────────*/

/* "Nice to have" is deliberately iconless. It sat directly above the five-square
   weight control, which IS this section's rating, so a star heading the card
   read as a second one — decorative, and clickable-looking without being
   clickable. The other two kinds keep icons that carry meaning: a must-have is
   a hard gate, a deal-breaker rejects outright. */
const KIND_ICON = { must: ShieldAlert, nice: null, deal_breaker: Ban } as const;

function CriterionRow({
  criterion, staleDays, onRemove, onConfirm, onWeight,
}: {
  criterion: Criterion;
  staleDays: number;
  onRemove: () => void;
  onConfirm: () => void;
  onWeight: (w: number) => void;
}) {
  const stale = isStale(criterion.confirmed_at, staleDays);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{criterion.label}</div>
        <button
          onClick={onConfirm}
          title="Mark as re-confirmed with the client"
          className={`text-[11px] mt-0.5 hover:underline ${stale ? 'text-warning font-medium' : 'text-text-tertiary'}`}
        >
          {confirmedAge(criterion.confirmed_at)}
          {stale && ' — still true?'}
        </button>
      </div>

      {/* Weight is meaningful only for nice-to-haves; a "must" is not 5x more
          mandatory than another "must" (CHECK-enforced in migration 17). */}
      {criterion.kind === 'nice' && (
        <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="How much this matters">
          {[1, 2, 3, 4, 5].map((w) => (
            <button
              key={w}
              onClick={() => onWeight(w)}
              aria-label={`Weight ${w}`}
              aria-pressed={criterion.weight === w}
              className={`w-4 h-4 rounded-sm transition-colors ${
                w <= criterion.weight ? 'bg-accent' : 'bg-border hover:bg-border-hover'}`}
            />
          ))}
        </div>
      )}

      <button
        onClick={onRemove}
        aria-label={`Remove "${criterion.label}"`}
        className="shrink-0 text-text-tertiary hover:text-error transition-colors p-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function AddCriterion({ kind, onAdd }: {
  kind: CriterionKind;
  onAdd: (draft: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [presetKey, setPresetKey] = useState('');
  const [value, setValue] = useState<unknown>('');
  const [custom, setCustom] = useState('');

  const available = CRITERION_PRESETS.filter((p) => p.kinds.includes(kind));
  const preset: CriterionPreset | undefined = available.find((p) => p.key === presetKey);

  const reset = () => { setOpen(false); setPresetKey(''); setValue(''); setCustom(''); };

  const submit = () => {
    if (!preset) return;
    const v = preset.key === 'custom' ? custom : (value === '' ? preset.defaultValue : value);
    if (preset.key === 'custom' && !custom.trim()) return;
    onAdd({
      kind,
      field: preset.field,
      op: preset.op,
      value: v as Criterion['value'],
      weight: kind === 'nice' ? 3 : 1,
      label: preset.label(v),
    });
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:opacity-80 mt-2"
      >
        <Plus size={14} /> Add {KIND_LABEL[kind].toLowerCase()}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-bg-elevated p-3 space-y-3">
      <select
        value={presetKey}
        onChange={(e) => { setPresetKey(e.target.value); setValue(''); }}
        aria-label={`What kind of ${KIND_LABEL[kind].toLowerCase()}?`}
        className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      >
        <option value="">Choose…</option>
        {available.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>

      {preset?.input === 'number' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={String(value === '' ? preset.defaultValue ?? '' : value)}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-text-tertiary">{preset.unit}</span>
        </div>
      )}

      {preset?.input === 'multiselect' && (
        <div className="flex flex-wrap gap-1.5">
          {preset.choices?.map((c) => {
            const list = Array.isArray(value) ? (value as string[]) : [];
            const on = list.includes(c.value);
            return (
              <Chip
                key={c.value}
                label={c.label}
                selected={on}
                onClick={() => setValue(on ? list.filter((x) => x !== c.value) : [...list, c.value])}
              />
            );
          })}
        </div>
      )}

      {preset?.key === 'custom' && (
        <Input
          placeholder="e.g. Must be walking distance to a subway station"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      )}

      {preset && (
        <p className="text-[11px] text-text-tertiary">
          Will read as: <span className="text-text-secondary font-medium">
            {preset.label(preset.key === 'custom' ? custom : (value === '' ? preset.defaultValue : value))}
          </span>
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={!preset}>Add</Button>
        <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
      </div>
    </div>
  );
}

function CriteriaGroup({
  kind, criteria, staleDays, onAdd, onRemove, onConfirm, onWeight,
}: {
  kind: CriterionKind;
  criteria: Criterion[];
  staleDays: number;
  onAdd: (d: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onRemove: (id: string) => void;
  onConfirm: (id: string) => void;
  onWeight: (id: string, w: number) => void;
}) {
  const Icon = KIND_ICON[kind];
  const rows = criteria.filter((c) => c.kind === kind);

  return (
    <Card padding="lg">
      <div className="flex items-baseline gap-2 mb-1">
        {Icon && <Icon size={15} className="text-accent self-center" />}
        <h3 className="text-sm font-bold text-text-primary">{KIND_LABEL[kind]}</h3>
        <span className="text-[11px] text-text-tertiary">{rows.length}</span>
      </div>
      <p className="text-[11px] text-text-tertiary mb-3">{KIND_HELP[kind]}</p>

      {rows.length === 0
        ? <p className="text-xs text-text-tertiary italic py-2">Nothing recorded yet.</p>
        : rows.map((c) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            staleDays={staleDays}
            onRemove={() => onRemove(c.id)}
            onConfirm={() => onConfirm(c.id)}
            onWeight={(w) => onWeight(c.id, w)}
          />
        ))}

      <AddCriterion kind={kind} onAdd={onAdd} />
    </Card>
  );
}

/* ── Geography ────────────────────────────────────────────────────────────*/

function GeographyPicker({
  geography, markets, onAdd, onRemove,
}: {
  geography: ClientGeography[];
  markets: MarketRow[];
  onAdd: (d: Omit<ClientGeography, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onRemove: (id: string) => void;
}) {
  const [slug, setSlug] = useState('');
  const [hood, setHood] = useState('');
  const [kind, setKind] = useState<'target' | 'exclude'>('target');

  const targets = geography.filter((g) => g.kind === 'target');
  const excludes = geography.filter((g) => g.kind === 'exclude');

  const marketName = (s: string) => markets.find((m) => m.slug === s)?.name ?? s;

  const submit = () => {
    if (!slug) return;
    onAdd({
      market_slug: slug,
      neighbourhood: hood.trim() || null,
      kind,
      rank: kind === 'target' ? targets.length + 1 : 1,
      note: null,
    });
    setHood('');
  };

  const Row = ({ g }: { g: ClientGeography }) => (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <MapPin size={13} className={g.kind === 'exclude' ? 'text-error shrink-0' : 'text-accent shrink-0'} />
      <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
        {g.neighbourhood ? `${g.neighbourhood}, ` : ''}{marketName(g.market_slug)}
      </span>
      {g.kind === 'target' && (
        <span className="text-[10px] text-text-tertiary shrink-0">#{g.rank}</span>
      )}
      <button
        onClick={() => onRemove(g.id)}
        aria-label="Remove area"
        className="shrink-0 text-text-tertiary hover:text-error p-1"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  return (
    <Card padding="lg">
      <div className="flex items-baseline gap-2 mb-1">
        <MapPin size={15} className="text-accent self-center" />
        <h3 className="text-sm font-bold text-text-primary">Where they will live</h3>
      </div>
      <p className="text-[11px] text-text-tertiary mb-3">
        Ontario only. Leave the neighbourhood blank to accept the whole city.
        An exclusion always beats a target.
      </p>

      {targets.length === 0 && excludes.length === 0 && (
        <p className="text-xs text-text-tertiary italic py-2">
          No areas yet — matches will not be filtered by location.
        </p>
      )}

      {targets.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mt-2 mb-1">Looking in</div>
          {targets.map((g) => <Row key={g.id} g={g} />)}
        </>
      )}

      {excludes.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-error mt-4 mb-1">Will not consider</div>
          {excludes.map((g) => <Row key={g.id} g={g} />)}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-label="Market"
          className="bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="">Choose a market…</option>
          {markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
        </select>
        <Input
          placeholder="Neighbourhood (optional)"
          value={hood}
          onChange={(e) => setHood(e.target.value)}
          className="w-56"
        />
        <div className="flex gap-1.5">
          <Chip label="Looking in" selected={kind === 'target'} onClick={() => setKind('target')} />
          <Chip label="Avoid" selected={kind === 'exclude'} onClick={() => setKind('exclude')} />
        </div>
        <Button size="sm" icon={Plus} onClick={submit} disabled={!slug}>Add</Button>
      </div>
    </Card>
  );
}

/* ── The section ──────────────────────────────────────────────────────────*/

export interface CriteriaEditorProps {
  criteria: Criterion[];
  geography: ClientGeography[];
  markets: MarketRow[];
  staleDays: number;
  onAddCriterion: (d: Omit<Criterion, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onUpdateCriterion: (id: string, patch: Partial<Criterion>) => void;
  onRemoveCriterion: (id: string) => void;
  onAddGeography: (d: Omit<ClientGeography, 'id' | 'client_id' | 'confirmed_at'>) => void;
  onRemoveGeography: (id: string) => void;
}

export function CriteriaEditor(p: CriteriaEditorProps) {
  const confirmOne = (id: string) =>
    p.onUpdateCriterion(id, { confirmed_at: new Date().toISOString() });

  return (
    <>
      <SectionTitle icon={ShieldAlert} title="What they need" hint="ASAP matches against exactly this" />
      <div className="grid lg:grid-cols-2 gap-3">
        <CriteriaGroup
          kind="must" criteria={p.criteria} staleDays={p.staleDays}
          onAdd={p.onAddCriterion} onRemove={p.onRemoveCriterion}
          onConfirm={confirmOne}
          onWeight={(id, w) => p.onUpdateCriterion(id, { weight: w })}
        />
        <CriteriaGroup
          kind="nice" criteria={p.criteria} staleDays={p.staleDays}
          onAdd={p.onAddCriterion} onRemove={p.onRemoveCriterion}
          onConfirm={confirmOne}
          onWeight={(id, w) => p.onUpdateCriterion(id, { weight: w })}
        />
        <CriteriaGroup
          kind="deal_breaker" criteria={p.criteria} staleDays={p.staleDays}
          onAdd={p.onAddCriterion} onRemove={p.onRemoveCriterion}
          onConfirm={confirmOne}
          onWeight={() => {}}
        />
        <GeographyPicker
          geography={p.geography} markets={p.markets}
          onAdd={p.onAddGeography} onRemove={p.onRemoveGeography}
        />
      </div>
    </>
  );
}

/** Small affordance used by the editor header — "I just spoke to them". */
export function ConfirmAllButton({ onConfirm, saving }: { onConfirm: () => void; saving: boolean }) {
  return (
    <Button variant="secondary" size="sm" icon={Check} loading={saving} onClick={onConfirm}>
      I just confirmed this with them
    </Button>
  );
}
