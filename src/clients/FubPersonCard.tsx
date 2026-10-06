/* ═══════════════════════════════════════════════════════════════════════════
   FubPersonCard — the Follow Up Boss record, laid out the way FUB lays it out.

   The point of this component is to be UNSURPRISING. A realtor who knows their
   CRM should recognise this at a glance: stage and source as badges, contact
   rows, who it is assigned to, when it was last touched, tags, timeframe, and
   the deal if there is one. Same vocabulary, same order.

   ASAP adds exactly one thing to it — the buyer brief, and that lives BELOW
   this card, collapsed, in ClientEditor. Nothing here is editable: FUB owns
   these fields, and a second place to change a phone number is how two systems
   start disagreeing.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  Mail, Phone, User, Clock, Tag, ExternalLink, Briefcase, MapPin, Star,
} from 'lucide-react';
import { Badge } from '../components/ui';
import { stageTone, relTime } from './clientCopy';
import type { FubPerson } from '../hooks/useFubPeople';

const money = (n: number | null | undefined): string | null =>
  n === null || n === undefined || !Number.isFinite(n)
    ? null
    : `$${Math.round(n).toLocaleString('en-CA')}`;

function Row({ icon: Icon, label, children }: {
  icon: typeof Mail; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon size={13} className="text-text-tertiary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
        <div className="text-sm text-text-primary break-words">{children}</div>
      </div>
    </div>
  );
}

export function FubPersonCard({ person }: { person: FubPerson }) {
  const primaryEmail = person.emails.find((e) => e.isPrimary) ?? person.emails[0];
  const primaryPhone = person.phones.find((p) => p.isPrimary) ?? person.phones[0];
  const lastTouch = relTime(person.lastActivity ?? person.updated);

  return (
    <div className="rounded-2xl border border-border bg-bg-surface overflow-hidden">
      {/* ── header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-text-primary tracking-tight truncate">
              {person.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {person.stage && <Badge label={person.stage} variant={stageTone(person.stage)} />}
              {person.source && (
                <span className="text-[11px] text-text-tertiary">via {person.source}</span>
              )}
            </div>
          </div>

          {/* The escape hatch. Anything ASAP does not show, FUB does — and this
              is one click rather than a search. */}
          <a
            href={person.fubUrl || undefined}
            target="_blank" aria-disabled={!person.fubUrl}
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:opacity-80"
          >
            Sample CRM record <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* ── contact + working context ── */}
      <div className="px-5 py-3 grid sm:grid-cols-2 gap-x-6">
        {primaryEmail && (
          <Row icon={Mail} label="Email">
            <a aria-label="Fictional sample email" className="hover:text-accent">
              {primaryEmail.value}
            </a>
            {person.emails.length > 1 && (
              <span className="text-[11px] text-text-tertiary ml-1.5">
                +{person.emails.length - 1} more
              </span>
            )}
          </Row>
        )}

        {primaryPhone && (
          <Row icon={Phone} label={primaryPhone.type ? `Phone · ${primaryPhone.type}` : 'Phone'}>
            <a aria-label="Fictional sample phone" className="hover:text-accent">
              {primaryPhone.value}
            </a>
          </Row>
        )}

        {person.assignedTo && (
          <Row icon={User} label="Assigned to">{person.assignedTo}</Row>
        )}

        {lastTouch && (
          <Row icon={Clock} label="Last activity">
            {lastTouch}
            {person.contacted !== null && person.contacted > 0 && (
              <span className="text-[11px] text-text-tertiary ml-1.5">
                · contacted {person.contacted}×
              </span>
            )}
          </Row>
        )}

        {person.timeframeStatus && (
          <Row icon={Clock} label="Timeframe">{person.timeframeStatus}</Row>
        )}

        {money(person.price) && (
          <Row icon={Star} label="Budget on file">{money(person.price)}</Row>
        )}

        {Array.isArray(person.addresses) && person.addresses.length > 0 && (
          <Row icon={MapPin} label="Address">
            {(() => {
              const a = person.addresses[0] as Record<string, string | undefined>;
              return [a?.street, a?.city, a?.state, a?.code].filter(Boolean).join(', ') || '—';
            })()}
          </Row>
        )}
      </div>

      {/* ── deal ── */}
      {person.dealName && (
        <div className="px-5 py-3 border-t border-border bg-bg-elevated/40">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase size={13} className="text-accent shrink-0" />
            <span className="text-sm font-semibold text-text-primary">{person.dealName}</span>
            {person.dealStage && <Badge label={person.dealStage} variant="info" />}
            {money(person.dealPrice) && (
              <span className="text-sm text-text-primary tabular-nums">{money(person.dealPrice)}</span>
            )}
            {person.dealCloseDate && (
              <span className="text-[11px] text-text-tertiary">
                closing {person.dealCloseDate.slice(0, 10)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── tags ── */}
      {person.tags.length > 0 && (
        <div className="px-5 py-3 border-t border-border flex items-center gap-1.5 flex-wrap">
          <Tag size={12} className="text-text-tertiary shrink-0" />
          {person.tags.map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border border-border text-text-secondary">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Roster row ───────────────────────────────────────────────────────────*/

export function FubPersonRow({
  person, selected, hasBrief, onSelect,
}: {
  person: FubPerson;
  selected: boolean;
  /** True when ASAP holds a buyer brief for this person. */
  hasBrief: boolean;
  onSelect: () => void;
}) {
  const last = relTime(person.lastActivity ?? person.updated);
  return (
    <button
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`w-full text-left rounded-xl border p-3 transition-all ${
        selected
          ? 'border-accent bg-accent/5 shadow-sm'
          : 'border-border bg-bg-surface hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary truncate">{person.name}</span>
        {hasBrief && (
          <span
            title="ASAP has a buyer brief for this client"
            className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-accent"
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {person.stage && <Badge label={person.stage} variant={stageTone(person.stage)} />}
      </div>
      {last && <div className="text-[11px] text-text-tertiary mt-1">Last activity {last}</div>}
    </button>
  );
}
