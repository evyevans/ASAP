import { useEffect, useState } from 'react';
import { ShieldCheck, SlidersHorizontal, KeyRound, User, DollarSign, RotateCcw, Save, MapPin, Target } from 'lucide-react';
import { Card, Button, Skeleton, Chip } from '../components/ui';
import { useMandate } from '../hooks/useMandate';
import { useMarkets } from '../hooks/useClients';
import { useOrgId } from '../hooks/useOrgId';
import { useExecutionData } from '../hooks/useExecutionData';
import { formatCurrency } from '../analytics/metricsMap';
import { MANDATE_PERMISSIONS, AUTONOMY_LEVELS, type MandateRow } from '../analytics/tabTypes';
import { PageShell, SectionTitle, Toggle } from './_shared';

/* Character limits are UI-only. asap_agent_mandate.focus and .guardrails are
 * unconstrained `text` in 08_mandate.sql — the cap exists so ASAP's prompt budget stays
 * predictable (every skill reads this row before every action), not because the column
 * demands it. Guardrails gets the bigger budget: it's a list of vetoes and grows. */
const FOCUS_LIMIT = 1000;
const GUARDRAILS_LIMIT = 2000;

/** A large, scrollable instruction box with a live character counter.
 *  Scrolls inside itself past max-h rather than stretching the page, and stays
 *  vertically resizable so a realtor writing a long veto list can open it up. */
function InstructionBox({
  label, help, value, onChange, limit, placeholder,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  limit: number;
  placeholder: string;
}) {
  const used = value.length;
  const near = used >= limit * 0.9;
  return (
    <div>
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <p className="text-[11px] text-text-tertiary mt-0.5">{help}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        maxLength={limit}
        placeholder={placeholder}
        className="mt-2 w-full max-h-72 overflow-y-auto bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary leading-relaxed outline-none focus:border-accent resize-y placeholder:text-text-tertiary"
      />
      <div className={`mt-1 text-right text-[11px] tabular-nums ${near ? 'text-warning' : 'text-text-tertiary'}`}>
        {used.toLocaleString()} / {limit.toLocaleString()}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">{label}</div>
      <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

/* Region order for the market picker — geographic, so the list reads the way a
 * GTA agent thinks about the province rather than alphabetically. */
const MARKET_REGIONS = ['GTA', 'Golden Horseshoe', 'Central', 'Southwestern', 'Eastern'] as const;

const toggleSlug = (list: string[], slug: string): string[] =>
  list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];

export default function Profile() {
  const { mandate, loading, saving, saveError, saveMandate } = useMandate();
  const { profile } = useOrgId();
  const { planner } = useExecutionData();
  // All markets, not just the active ones — this IS the screen where they pick.
  const { markets, loading: marketsLoading } = useMarkets();

  const [draft, setDraft] = useState<MandateRow | null>(null);
  useEffect(() => { if (mandate && !draft) setDraft(mandate); }, [mandate, draft]);

  const dirty = !!draft && !!mandate && JSON.stringify(draft) !== JSON.stringify(mandate);
  const set = (patch: Partial<MandateRow>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const togglePerm = (key: string) => set({ permissions: { ...draft!.permissions, [key]: !draft!.permissions?.[key] } });

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Your account';

  return (
    <PageShell
      title="Your Profile"
      subtitle="The mandate ASAP acts on — your goals, and exactly what it may do on your behalf. ASAP reads this before every action."
      actions={
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={RotateCcw} disabled={!dirty} onClick={() => setDraft(mandate)}>Reset</Button>
            <Button size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={() => draft && saveMandate(draft)}>Save Profile</Button>
          </div>
          {/* saveMandate rolls back the optimistic update on failure (a CHECK
           * constraint rejection, e.g.) — this is what makes that rollback
           * visible instead of the save silently appearing to have worked. */}
          {saveError && <span className="text-xs text-error">Save failed: {saveError}</span>}
        </div>
      }
    >
      {loading || !draft ? (
        <div className="space-y-4"><Skeleton height="120px" rounded="lg" /><Skeleton height="200px" rounded="lg" /></div>
      ) : (
        <>
          {/* Identity */}
          <SectionTitle icon={User} title="Identity" />
          <Card padding="lg">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <Field label="Name" value={name} />
              <Field label="Role" value={profile?.role ?? 'owner'} />
              <Field label="Primary market" value={planner?.primaryMarket ?? '—'} />
            </div>
          </Card>

          {/* Goals (from msp_success_plans — set at onboarding, shown for context) */}
          <SectionTitle icon={DollarSign} title="Your goals" hint="every ASAP action ladders to these" />
          <Card padding="lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <Field label="Monthly target" value={formatCurrency(planner?.goalIncome ?? null)} />
              <Field label="Per deal" value={formatCurrency(planner?.avgCommission ?? null)} />
              <Field label="Main focus" value={planner?.mainFocus ?? '—'} />
              <Field label="Known bottleneck" value={planner?.bottleneck ?? '—'} />
            </div>
          </Card>

          {/* ── Ontario markets ──────────────────────────────────────────
              Province is fixed; cities are the realtor's to choose. This
              selection scopes Market Scout's map bounds, the areas offered on
              a client brief, and which listings ASAP researches at all. */}
          <SectionTitle icon={MapPin} title="Your markets" hint="Ontario — pick the cities you actually work" />
          <Card padding="lg">
            <p className="text-[11px] text-text-tertiary mb-3">
              Nothing selected means all of Ontario. Narrowing this keeps ASAP's research —
              and your matches — on the ground you actually cover.
            </p>
            {marketsLoading ? (
              <Skeleton height="80px" rounded="lg" />
            ) : (
              <div className="space-y-4">
                {MARKET_REGIONS.map((region) => {
                  const inRegion = markets.filter((m) => m.region === region);
                  if (inRegion.length === 0) return null;
                  return (
                    <div key={region}>
                      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">{region}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {inRegion.map((m) => (
                          <Chip
                            key={m.slug}
                            label={m.name}
                            selected={(draft.active_markets ?? []).includes(m.slug)}
                            onClick={() => set({ active_markets: toggleSlug(draft.active_markets ?? [], m.slug) })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-text-tertiary mt-4">
              {(draft.active_markets ?? []).length === 0
                ? 'All Ontario markets are in scope.'
                : `${draft.active_markets.length} market${draft.active_markets.length === 1 ? '' : 's'} selected.`}
            </p>
          </Card>

          {/* ── Matching preferences ─────────────────────────────────────
              The review-fatigue controls. The brief names "review fatigue from
              too many proposals" as a trust risk; these are the two dials that
              actually govern it, so they belong to the realtor rather than to
              a constant in the engine. */}
          <SectionTitle icon={Target} title="Matching" hint="how much ASAP puts in front of you" />
          <Card padding="lg">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs font-medium text-text-secondary">Surface matches from</label>
                <p className="text-[11px] text-text-tertiary mt-0.5">Weaker matches are still saved — they just do not interrupt you.</p>
                <div className="flex gap-1.5 mt-2">
                  {(['strong', 'possible', 'stretch'] as const).map((b) => (
                    <Chip
                      key={b}
                      label={b === 'strong' ? 'Strong only' : b === 'possible' ? 'Possible +' : 'Everything'}
                      selected={draft.match_min_band === b}
                      onClick={() => set({ match_min_band: b })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary">
                  Most per client, per day: <span className="text-text-primary font-bold tabular-nums">{draft.match_daily_cap}</span>
                </label>
                <p className="text-[11px] text-text-tertiary mt-0.5">A hard ceiling on proposals.</p>
                <input
                  type="range" min={0} max={25} value={draft.match_daily_cap}
                  onChange={(e) => set({ match_daily_cap: Number(e.target.value) })}
                  aria-label="Maximum matches surfaced per client per day"
                  className="w-full mt-3 accent-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary">
                  Treat a brief as stale after <span className="text-text-primary font-bold tabular-nums">{draft.match_stale_days}</span> days
                </label>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Past this, matches are marked and ranked down rather than trusted.
                </p>
                <input
                  type="range" min={14} max={365} step={7} value={draft.match_stale_days}
                  onChange={(e) => set({ match_stale_days: Number(e.target.value) })}
                  aria-label="Days before a client brief is considered stale"
                  className="w-full mt-3 accent-[var(--color-accent)]"
                />
              </div>
            </div>
          </Card>

          {/* Autonomy level */}
          <SectionTitle icon={SlidersHorizontal} title="Autonomy" hint="how far ASAP may go without asking" />
          <div className="grid md:grid-cols-3 gap-3">
            {AUTONOMY_LEVELS.map((lvl) => {
              const active = draft.autonomy_level === lvl.key;
              return (
                <button key={lvl.key} onClick={() => set({ autonomy_level: lvl.key })}
                  className={`text-left rounded-2xl border p-4 transition-all ${active ? 'border-accent bg-accent/5 shadow-sm' : 'border-border bg-bg-surface hover:border-accent/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-accent' : 'bg-border'}`} />
                    <span className="text-sm font-bold text-text-primary capitalize">{lvl.label}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{lvl.help}</p>
                </button>
              );
            })}
          </div>

          {/* Permissions */}
          <SectionTitle icon={KeyRound} title="Permissions" hint="what ASAP may do on your behalf" />
          <Card padding="lg">
            {/* Master gate — every action the registry tags external_comm: true
             * checks this FIRST, before any toggle below. Off by default: this
             * account is not yet a licensed Ontario realtor, so client-facing
             * sends stay structurally impossible regardless of what's toggled
             * below until this is explicitly turned on. */}
            <div className="pb-5 mb-5 border-b border-border">
              <Toggle
                on={!!draft.client_comms_enabled}
                onClick={() => set({ client_comms_enabled: !draft.client_comms_enabled })}
                label="Allow client-facing communication"
                help="Master switch for every send/schedule action below. Off means ASAP cannot reach a client no matter what else is enabled."
              />
            </div>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
              {MANDATE_PERMISSIONS.map((p) => (
                <Toggle key={p.key} on={!!draft.permissions?.[p.key]} onClick={() => togglePerm(p.key)} label={p.label} help={p.help} />
              ))}
            </div>
          </Card>

          {/* Guardrails */}
          <SectionTitle icon={ShieldCheck} title="Guardrails" hint="hard limits ASAP will never cross" />
          <Card padding="lg">
            <div className="flex flex-col gap-6">
              <InstructionBox
                label="What should ASAP prioritize?"
                help="Standing direction. ASAP weights its week against this."
                value={draft.focus ?? ''}
                onChange={(v) => set({ focus: v })}
                limit={FOCUS_LIMIT}
                placeholder="e.g. Nurture buyer leads under $900K in Mississauga and Oakville; protect my mornings for showings; follow up on every open-house registration within 24 hours."
              />
              <InstructionBox
                label="Never do this"
                help="Hard vetoes. These override every permission above."
                value={draft.guardrails ?? ''}
                onChange={(v) => set({ guardrails: v })}
                limit={GUARDRAILS_LIMIT}
                placeholder="e.g. Never send a legal document without my approval; never contact a lead flagged Do-Not-Disturb; never quote a price or estimate a home's value; never text anyone before 9am or after 8pm."
              />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
