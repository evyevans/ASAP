/* ═══════════════════════════════════════════════════════════════════════════
   Clients — your Follow Up Boss roster, with ASAP's brief underneath.

   WHAT CHANGED, AND WHY
   The first version of this page asked you to create clients in ASAP from
   scratch: a "New client's name" box and an empty form. That was a second CRM
   to keep in sync with the one you already have, and the whole point of ASAP
   is that Hermes already works out of Follow Up Boss.

   So the roster IS Follow Up Boss — read live through an edge function, never
   mirrored. You pick a person; you see their record the way FUB shows it. The
   only thing ASAP adds is the buyer brief, and it sits BELOW that card,
   collapsed, saying "not set" until you decide it is worth filling in.

   Nothing here forces a form. A brief is what makes matches explainable, so
   it earns its place by being useful, not by blocking the page.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import { Users, Search, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, Card, Input, Skeleton, EmptyState, Chip } from '../components/ui';
import { PageShell } from './_shared';
import { useFubPeople, useFubPerson, type FubPerson } from '../hooks/useFubPeople';
import { useClients, useClientDetail, useMarkets } from '../hooks/useClients';
import { useMandate } from '../hooks/useMandate';
import { FubPersonCard, FubPersonRow } from '../clients/FubPersonCard';
import { ClientEditor } from '../clients/ClientEditor';
import { confirmedAge, isStale } from '../clients/clientCopy';

export default function Clients() {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [selectedFubId, setSelectedFubId] = useState<number | null>(null);
  /* null = follow this person's default; true/false = you said otherwise.
   * Derived rather than stored, for the same reason as the selection below:
   * a brief that is already filled in should not present as a closed drawer,
   * and syncing a boolean against "does this person have a brief" in an effect
   * is how the two drift apart. */
  const [briefToggle, setBriefToggle] = useState<boolean | null>(null);
  const [creatingBrief, setCreatingBrief] = useState(false);

  const { people, total, stages, loading, error, refresh } = useFubPeople(query, stage);
  const { clients, ensureClientForFubPerson, byFubId, deleteClient } = useClients();
  const { mandate } = useMandate();
  const { markets } = useMarkets(mandate?.active_markets ?? []);

  const staleDays = mandate?.match_stale_days ?? 90;

  /* Selection derived, not stored-and-synced: what you asked for if it is still
   * in the current result set, else the first row. Filtering the roster can
   * therefore never leave a selection pointing at something off-screen. */
  const [requestedId, setRequestedId] = useState<number | null>(null);
  const effectiveId = (requestedId && people.some((p) => p.id === requestedId))
    ? requestedId
    : (people[0]?.id ?? null);

  const selectedPerson: FubPerson | undefined =
    people.find((p) => p.id === effectiveId);

  const { detail, loading: detailLoading } = useFubPerson(effectiveId);
  const person = detail?.person ?? selectedPerson;

  // The ASAP-side brief for this person, if one exists.
  const brief = effectiveId !== null ? byFubId(effectiveId) : undefined;
  const briefDetail = useClientDetail(brief?.id ?? null);

  /* Open by default for anyone who HAS a brief — there is nothing to reveal,
   * and hiding filled-in criteria behind a chevron is what left the right-hand
   * column empty. Someone without a brief stays collapsed, because opening is
   * what creates the row: see openBrief. */
  const briefOpen = briefToggle ?? Boolean(brief);

  const openBrief = async () => {
    if (!person) return;
    setBriefToggle(true);
    if (brief) return;
    // Lazily create the ASAP record the first time you actually want one.
    setCreatingBrief(true);
    await ensureClientForFubPerson(person.id, person.name);
    setCreatingBrief(false);
  };

  const briefSummary = useMemo(() => {
    if (!brief) return 'not set';
    const bits: string[] = [];
    if (brief.budget_max !== null) {
      bits.push(`up to $${Math.round(brief.budget_max).toLocaleString('en-CA')}`);
    }
    const n = briefDetail.context?.criteria.length ?? 0;
    if (n > 0) bits.push(`${n} requirement${n === 1 ? '' : 's'}`);
    if (bits.length === 0) return 'started, nothing recorded yet';
    const stale = isStale(brief.criteria_confirmed_at, staleDays);
    return bits.join(' · ') + (stale ? ` · ${confirmedAge(brief.criteria_confirmed_at)}` : '');
  }, [brief, briefDetail.context, staleDays]);

  void selectedFubId; // selection is derived; this keeps the setter honest below

  return (
    <PageShell
      title="Your clients"
      subtitle="Sample Follow Up Boss workspace. Pick someone to see their record — and give ASAP the brief it matches listings against."
      actions={
        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="text-xs text-text-tertiary tabular-nums">
              {people.length}{people.length !== total ? ` of ${total}` : ''} sample contacts
            </span>
          )}
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refresh}>Refresh</Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-error/30 bg-error/8 px-4 py-3 text-sm text-error">
          {error} <button onClick={refresh} className="underline font-medium ml-1">Try again</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ── roster ──
            Bounded and self-scrolling above `lg`. A 50-person roster is ~3,800px
            tall; letting it set the page height is what left thousands of pixels
            of nothing beside it, and it also made the `sticky` here inert —
            sticky does nothing for an element TALLER than its scroll container.

            The height is derived, not guessed: App.tsx header h-14 (3.5rem) +
            TabBar h-11 (2.75rem) + this top-4 (1rem) + ~1.25rem of breathing
            room at the bottom.

            Everything is lg:-prefixed on purpose. On a phone the grid is one
            column and this rail sits ABOVE the record, where a short inner
            scrollbox would be worse than the problem it fixes. */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8.5rem)]">
          {/* Pinned. Filtering fifty people is the whole job of this box, so it
              must not scroll away with the rows it filters. */}
          <div className="shrink-0 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <Input
                placeholder="Find a client by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Chips built from the stages this account actually uses — not a
                hardcoded list that drifts the moment someone renames one. */}
            {stages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <Chip label="All" selected={stage === null} onClick={() => setStage(null)} />
                {stages.map((s) => (
                  <Chip key={s} label={s} selected={stage === s} onClick={() => setStage(stage === s ? null : s)} />
                ))}
              </div>
            )}
          </div>

          {/* lg:min-h-0 is load-bearing, not defensive. A flex child defaults to
              min-height:auto and refuses to shrink below its content, so without
              it the overflow never engages and this grows back to 3,800px —
              the original bug, silently restored. */}
          <div className="space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1 scrollbar-thin">
            {loading ? (
              <>
                <Skeleton height="72px" rounded="lg" />
                <Skeleton height="72px" rounded="lg" />
                <Skeleton height="72px" rounded="lg" />
              </>
            ) : people.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">
                {query.trim() ? `Nobody sample contacts matches "${query.trim()}".` : 'No people sample contacts yet.'}
              </p>
            ) : (
              people.map((p) => (
                <FubPersonRow
                  key={p.id}
                  person={p}
                  selected={p.id === effectiveId}
                  hasBrief={Boolean(byFubId(p.id))}
                  onSelect={() => { setRequestedId(p.id); setSelectedFubId(p.id); setBriefToggle(null); }}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── the person ── */}
        <main className="space-y-4">
          {loading && !person ? (
            <Skeleton height="280px" rounded="lg" />
          ) : !person ? (
            <Card padding="lg">
              <EmptyState
                icon={Users}
                title="No clients to show"
                message={
                  'This reads your Follow Up Boss people directly — nothing is copied into ASAP. ' +
                  'Add someone in FUB and they will appear here.'
                }
              />
            </Card>
          ) : (
            <>
              <FubPersonCard person={person} />

              {/* ── ASAP's brief, collapsed ──
                  Deliberately secondary. FUB owns who this person is; ASAP owns
                  what they are looking for, and only if you say so. */}
              <div className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
                <button
                  onClick={() => (briefOpen ? setBriefToggle(false) : openBrief())}
                  className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-bg-elevated/50 transition-colors"
                  aria-expanded={briefOpen}
                >
                  {briefOpen
                    ? <ChevronDown size={15} className="text-text-tertiary shrink-0" />
                    : <ChevronRight size={15} className="text-text-tertiary shrink-0" />}
                  <span className="text-sm font-bold text-text-primary">ASAP brief</span>
                  <span className={`text-xs ${brief ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                    {creatingBrief ? 'starting…' : briefSummary}
                  </span>
                  {!brief && (
                    <span className="ml-auto text-xs font-medium text-accent shrink-0">
                      Add budget &amp; must-haves
                    </span>
                  )}
                </button>

                {briefOpen && (
                  <div className="px-5 pb-5 border-t border-border pt-4">
                    <p className="text-[11px] text-text-tertiary mb-4 max-w-2xl leading-relaxed">
                      What ASAP scores listings against. It is optional — but without it,
                      a match cannot be explained back to {person.firstName ?? 'them'} in your own words,
                      and it goes stale silently.
                    </p>

                    {briefDetail.loading || creatingBrief ? (
                      <Skeleton height="200px" rounded="lg" />
                    ) : briefDetail.context ? (
                      <ClientEditor
                        context={briefDetail.context}
                        markets={markets}
                        staleDays={staleDays}
                        saving={briefDetail.saving}
                        error={briefDetail.error}
                        onSave={briefDetail.saveClient}
                        onDelete={async () => {
                          if (brief && confirm(`Remove ASAP's brief for ${person.name}? Their Follow Up Boss record is untouched.`)) {
                            await deleteClient(brief.id);
                            // Back to the default rather than a forced false:
                            // with the brief gone the default IS closed, and no
                            // stale override is left behind to fight the next
                            // person's default.
                            setBriefToggle(null);
                          }
                        }}
                        onConfirmAll={briefDetail.confirmAll}
                        onAddCriterion={briefDetail.addCriterion}
                        onUpdateCriterion={briefDetail.updateCriterion}
                        onRemoveCriterion={briefDetail.removeCriterion}
                        onAddGeography={briefDetail.addGeography}
                        onRemoveGeography={briefDetail.removeGeography}
                        hideIdentity
                      />
                    ) : (
                      <p className="text-sm text-text-secondary">
                        {briefDetail.error ?? 'Could not open the brief.'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Recent activity from FUB — read-only context, not a feed to act on. */}
              {detail && (detail.notes.length > 0 || detail.tasks.length > 0) && (
                <div className="rounded-2xl border border-border bg-bg-surface px-5 py-4">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3">
                    Recent sample contacts
                  </h3>
                  <ul className="space-y-2">
                    {detail.notes.slice(0, 5).map((n) => (
                      <li key={`n${n.id}`} className="text-xs text-text-secondary">
                        <span className="text-text-tertiary">Note</span>{' '}
                        {n.subject || (n.body ?? '').slice(0, 120) || '—'}
                      </li>
                    ))}
                    {detail.tasks.slice(0, 5).map((t) => (
                      <li key={`t${t.id}`} className="text-xs text-text-secondary">
                        <span className="text-text-tertiary">Task</span> {t.name ?? '—'}
                        {t.dueDate && <span className="text-text-tertiary"> · due {t.dueDate.slice(0, 10)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detailLoading && !detail && <Skeleton height="80px" rounded="lg" />}
            </>
          )}

          {clients.length > 0 && people.length > 0 && (
            <p className="text-[11px] text-text-tertiary flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-text-tertiary" />
              {clients.length} of your Follow Up Boss clients {clients.length === 1 ? 'has' : 'have'} an ASAP brief.
            </p>
          )}
        </main>
      </div>
    </PageShell>
  );
}
