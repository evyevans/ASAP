/* Translates the live Supabase agent_events vocabulary (block, fub, lead, doc prefixes)
 * into the WorldStore's ASAPEvent vocabulary (task, ext, agent prefixes) so the
 * office choreography (processEvent) runs off REAL events only.
 * Returns null for rows that must not animate (log-only or freshness-only). */
import type { AgentEventRow } from '../analytics/agentEventTypes';
import type { ASAPEvent, AgentId } from './types';

type Mapped = { eventType: string; agentId: AgentId } | null;

function classify(t: string): Mapped {
  switch (t) {
    case 'block.started':        return { eventType: 'task.started',   agentId: 'hermes' };
    case 'block.executed':       return { eventType: 'task.completed', agentId: 'hermes' };
    case 'block.needs_approval': return { eventType: 'task.escalated', agentId: 'hermes' };
    case 'block.failed':         return { eventType: 'task.failed',    agentId: 'hermes' };
    case 'block.skipped':        return null; // log-only
    case 'draft.approved':
    case 'draft.rejected':       return null; // user decisions — log-only
    case 'doc.generated':        return { eventType: 'task.escalated', agentId: 'hitl_monitor' };
    case 'doc.approved':         return { eventType: 'task.completed', agentId: 'hitl_monitor' };
    case 'doc.rejected':
    case 'doc.expired':          return null;
    case 'fub.appointment_booked': return { eventType: 'task.completed', agentId: 'calendar' };
    case 'lead.overdue':         return { eventType: 'task.escalated', agentId: 'wfusa' };
    case 'research.compiled':    return { eventType: 'task.completed', agentId: 'vector_memory' };
    case 'system.heartbeat':     return null; // freshness only
    case 'system.error':         return { eventType: 'agent.error',    agentId: 'asap_router' };
    case 'ext.webhook_received': return { eventType: 'ext.webhook_received', agentId: 'asap_router' };
  }
  if (t.startsWith('fub.'))  return { eventType: 'task.completed', agentId: 'asap_router' };
  if (t.startsWith('lead.')) return { eventType: 'task.completed', agentId: 'wfusa' };
  return null;
}

const category = (t: string): ASAPEvent['eventCategory'] =>
  t.startsWith('task.') ? 'task'
  : t.startsWith('ext.') ? 'external'
  : t.startsWith('agent.') ? 'agent'
  : 'system';

export function mapAgentEvent(row: AgentEventRow): ASAPEvent | null {
  const m = classify(row.event_type);
  if (!m) return null;
  const payload = row.payload ?? {};
  const description =
    (payload.block_title as string | undefined) ??
    (payload.output_summary as string | undefined) ??
    row.event_type;
  return {
    id: `ae-${row.id}`,
    tenantId: row.org_id,
    sequence: row.sequence,
    eventType: m.eventType,
    eventCategory: category(m.eventType),
    agentId: m.agentId,
    taskId: (payload.calendar_event_id as string | undefined) ?? null,
    timestamp: row.created_at,
    payload: { ...(payload as Record<string, unknown>), description },
  };
}
