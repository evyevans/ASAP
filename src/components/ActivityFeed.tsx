/* ================================================================
   ASAP — Agent Activity Feed
   Chronological, searchable, filterable audit trail of every action
   the AI agent fleet has taken. Replaces the Pixel Office as the
   primary "Live Activity" view.

   Design directive (Claude Consultant, April 2026):
     "The audit function deserves a UI that feels like a professional
      record, not an entertainment layer."
   ================================================================ */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useWorldStore, selectActivityLog, type ActivityLogEntry } from '../engine/WorldStore';
import { AGENT_PROFILES, type AgentId } from '../engine/types';
import {
  CheckCircle, Warning, Info, XCircle,
  MagnifyingGlass, Funnel, ArrowsClockwise, Detective,
} from '@phosphor-icons/react';
import './ActivityFeed.css';

// ── Agent color palette (matches sidebar dots) ───────────────────
const AGENT_COLORS: Record<string, string> = {
  wfusa:           '#a78bfa',  // violet
  calendar:        '#34d399',  // emerald
  asap_router:     '#60a5fa',  // blue
  vector_memory:   '#f59e0b',  // amber
  planning_engine: '#38bdf8',  // sky
  hitl_monitor:    '#fb923c',  // orange
};

const STATUS_ICONS = {
  success: <CheckCircle weight="fill" size={14} />,
  error:   <XCircle weight="fill" size={14} />,
  warning: <Warning weight="fill" size={14} />,
  info:    <Info weight="fill" size={14} />,
};

type FilterStatus = 'all' | 'success' | 'error' | 'warning' | 'info';

export default function ActivityFeed() {
  const activityLog = useWorldStore(selectActivityLog);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll to top when new entries arrive
  useEffect(() => {
    if (activityLog.length > prevCountRef.current && topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCountRef.current = activityLog.length;
  }, [activityLog.length]);

  const agentIds = useMemo(
    () => Array.from(new Set(activityLog.map(e => e.agentId).filter(Boolean))) as string[],
    [activityLog]
  );

  const filtered = useMemo(() => {
    return activityLog.filter(entry => {
      if (filter !== 'all' && entry.status !== filter) return false;
      if (agentFilter !== 'all' && entry.agentId !== agentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          entry.summary.toLowerCase().includes(q) ||
          entry.agentName.toLowerCase().includes(q) ||
          (entry.detail?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [activityLog, filter, agentFilter, search]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="activity-feed">
      {/* ── Toolbar ── */}
      <div className="af-toolbar">
        <div className="af-search-wrap">
          <MagnifyingGlass size={15} className="af-search-icon" />
          <input
            className="af-search"
            placeholder="Search agent activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="af-toolbar-right">
          <button
            className={`af-filter-btn ${filterOpen ? 'af-filter-btn--active' : ''}`}
            onClick={() => setFilterOpen(!filterOpen)}
            title="Filter"
          >
            <Funnel size={15} weight={filterOpen ? 'fill' : 'regular'} />
            Filters
            {(filter !== 'all' || agentFilter !== 'all') && (
              <span className="af-filter-dot" />
            )}
          </button>

          <span className="af-count">
            {filtered.length} / {activityLog.length} events
          </span>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      {filterOpen && (
        <div className="af-filter-panel">
          <div className="af-filter-section">
            <span className="af-filter-label">Status</span>
            <div className="af-filter-pills">
              {(['all', 'success', 'error', 'warning', 'info'] as FilterStatus[]).map(s => (
                <button
                  key={s}
                  className={`af-pill af-pill--${s} ${filter === s ? 'af-pill--active' : ''}`}
                  onClick={() => setFilter(s)}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="af-filter-section">
            <span className="af-filter-label">Agent</span>
            <div className="af-filter-pills">
              <button
                className={`af-pill ${agentFilter === 'all' ? 'af-pill--active' : ''}`}
                onClick={() => setAgentFilter('all')}
              >
                All Agents
              </button>
              {agentIds.map(id => {
                const profile = AGENT_PROFILES[id as AgentId];
                return (
                  <button
                    key={id}
                    className={`af-pill ${agentFilter === id ? 'af-pill--active' : ''}`}
                    style={agentFilter === id ? { borderColor: AGENT_COLORS[id] } : {}}
                    onClick={() => setAgentFilter(id)}
                  >
                    {profile?.icon} {profile?.name ?? id}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Feed ── */}
      <div className="af-feed">
        <div ref={topRef} />

        {filtered.length === 0 ? (
          <EmptyState connected={activityLog.length > 0} />
        ) : (
          filtered.map((entry, idx) => (
            <FeedEntry
              key={entry.id}
              entry={entry}
              expanded={expandedIds.has(entry.id)}
              onToggle={() => toggleExpand(entry.id)}
              isNew={idx === 0 && activityLog.length > 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Feed Entry ────────────────────────────────────────────────────
function FeedEntry({
  entry,
  expanded,
  onToggle,
  isNew,
}: {
  entry: ActivityLogEntry;
  expanded: boolean;
  onToggle: () => void;
  isNew: boolean;
}) {
  const profile = entry.agentId ? AGENT_PROFILES[entry.agentId as AgentId] : null;
  const color = entry.agentId ? (AGENT_COLORS[entry.agentId] ?? '#94a3b8') : '#94a3b8';
  const time = formatTime(entry.timestamp);

  return (
    <button
      className={`af-entry af-entry--${entry.status} ${isNew ? 'af-entry--new' : ''} ${expanded ? 'af-entry--expanded' : ''}`}
      onClick={entry.detail ? onToggle : undefined}
      aria-expanded={entry.detail ? expanded : undefined}
      style={{ '--agent-color': color } as React.CSSProperties}
    >
      <div className="af-entry-left">
        {/* Agent avatar */}
        <div className="af-avatar" style={{ background: `${color}20`, borderColor: `${color}40` }}>
          <span className="af-avatar-icon">{profile?.icon ?? '?'}</span>
        </div>
        {/* Timeline connector */}
        <div className="af-connector" />
      </div>

      <div className="af-entry-body">
        <div className="af-entry-header">
          <span className="af-agent-name" style={{ color }}>
            {entry.agentName}
          </span>
          <span className={`af-status-badge af-status-badge--${entry.status}`}>
            {STATUS_ICONS[entry.status]}
            {entry.status}
          </span>
          <span className="af-timestamp">{time}</span>
        </div>

        <p className="af-summary">{entry.summary}</p>

        {expanded && entry.detail && (
          <div className="af-detail">
            <ArrowsClockwise size={12} className="af-detail-icon" />
            {entry.detail}
          </div>
        )}

        <div className="af-event-type">
          {entry.eventType}
          {entry.detail && (
            <span className="af-expand-hint">{expanded ? '↑ less' : '↓ more'}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="af-empty">
      <div className="af-empty-icon">
        <Detective size={40} weight="duotone" />
      </div>
      {connected ? (
        <>
          <p className="af-empty-title">No matching activity</p>
          <p className="af-empty-sub">Try adjusting your search or filters.</p>
        </>
      ) : (
        <>
          <p className="af-empty-title">Waiting for agents to come online</p>
          <p className="af-empty-sub">
            Every action your agent fleet takes will appear here in real time
            — coaching calls, calendar syncs, HITL check-ins, and more.
          </p>
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1)  return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24)  return `${diffHrs}h ago`;

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
