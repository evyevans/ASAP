/* ================================================================
   ANTI-GRAVITY — World State Store (Zustand)
   Immutable snapshot-based state management for the simulation engine.
   The Canvas renderer reads snapshots; it NEVER mutates this store.
   ================================================================ */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AgentId,
  AgentROI,
  AgentState,
  AgentStatus,
  ASAPEvent,
  WorldSnapshot,
  AnalyticsState,
  TimelineBucket,
  MetricSnapshot,
} from './types';
import { AGENT_PROFILES } from './types';

// ── Activity Log Entry ───────────────────────────────────────────
export interface ActivityLogEntry {
  id: string;
  timestamp: string;          // ISO 8601
  agentId: AgentId | null;
  agentName: string;
  eventType: string;
  summary: string;            // Human-readable one-liner
  detail?: string;            // Optional expanded detail
  status: 'success' | 'error' | 'info' | 'warning';
}

const MAX_LOG_ENTRIES = 200;

// ── Default Agent State Factory ──────────────────────────────────
function createDefaultAgentState(id: AgentId, index: number): AgentState {
  const angle = (index / 7) * Math.PI * 2 - Math.PI / 2;
  const radius = 200;
  const centerX = 400;
  const centerY = 300;

  const base = {
    id,
    status: 'idle' as const,
    position: {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    },
    targetPosition: null,
    currentTask: null,
    lastActivity: new Date().toISOString(),
    tasksCompleted: 0,
    uptime: 100,
    animationFrame: 0,
    animationTime: 0,
  };

  if (id === 'hermes') {
    return { ...base, position: { x: 400, y: 300 }, targetPosition: null };
  }

  return base;
}

// ── Store Interface ──────────────────────────────────────────────
interface WorldStore {
  agents: Record<AgentId, AgentState>;
  activeConnections: number;
  lastEventSequence: number;
  lastEventTimestamp: string;
  systemStatus: 'connected' | 'reconnecting' | 'disconnected';

  // Activity log — the audit trail
  activityLog: ActivityLogEntry[];

  analytics: AnalyticsState;
  eventQueue: ASAPEvent[];

  // World actions
  getSnapshot: () => WorldSnapshot;
  setSystemStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  updateAgentStatus: (agentId: AgentId, status: AgentStatus) => void;
  updateAgentPosition: (agentId: AgentId, x: number, y: number) => void;
  setAgentTargetPosition: (agentId: AgentId, target: { x: number; y: number } | null) => void;
  setAgentTask: (agentId: AgentId, task: AgentState['currentTask']) => void;
  incrementAgentTasks: (agentId: AgentId) => void;

  // Activity log actions
  addActivityEntry: (entry: Omit<ActivityLogEntry, 'id'>) => void;
  clearActivityLog: () => void;

  // Event queue actions
  enqueueEvent: (event: ASAPEvent) => void;
  enqueueEvents: (events: ASAPEvent[]) => void;
  processNextEvent: () => ASAPEvent | null;
  clearEventQueue: () => void;

  // Analytics actions
  updateMetric: (key: keyof AnalyticsState['metrics'], update: Partial<MetricSnapshot>) => void;
  setAgentROI: (agentROI: AgentROI[]) => void;
  setActivityTimeline: (timeline: TimelineBucket[]) => void;
  setAnalyticsLoading: (loading: boolean) => void;

  // Time machine actions (deprecated — kept as no-ops to avoid breaking API surface)
  // These will be fully removed in the next store major version.

  // Bulk actions
  applyWorldSnapshot: (snapshot: WorldSnapshot) => void;
  processEvent: (event: ASAPEvent) => void;
}

// ── Agent IDs ────────────────────────────────────────────────────
const AGENT_IDS: AgentId[] = [
  'hermes', 'wfusa', 'calendar', 'asap_router', 'vector_memory',
  'planning_engine', 'hitl_monitor',
];

// ── Event → Human-readable log entry ────────────────────────────
function buildLogEntry(event: ASAPEvent): Omit<ActivityLogEntry, 'id'> | null {
  if (!event.agentId) return null;
  const profile = AGENT_PROFILES[event.agentId];
  const agentName = profile?.name ?? event.agentId;
  const payload = event.payload ?? {};

  const base = {
    timestamp: event.timestamp,
    agentId: event.agentId,
    agentName,
    eventType: event.eventType,
  };

  switch (event.eventType) {
    case 'task.received':
      return {
        ...base,
        summary: `Task received — ${(payload.description as string) || 'Processing new task'}`,
        detail: payload.taskType ? `Task type: ${payload.taskType}` : undefined,
        status: 'info',
      };

    case 'task.started':
      return { ...base, summary: 'Processing started', status: 'info' };

    case 'task.completed': {
      const desc = (payload.description as string) || (payload.taskType as string) || 'Task';
      const count = (payload.eventsCreated as number) ?? (payload.count as number);
      return {
        ...base,
        summary: `${desc} completed successfully`,
        detail: count ? `${count} items processed` : undefined,
        status: 'success',
      };
    }

    case 'task.failed':
      return {
        ...base,
        summary: `Task failed — ${(payload.error as string) || 'Unknown error'}`,
        status: 'error',
      };

    case 'task.escalated':
      return { ...base, summary: 'Escalation triggered — manual review needed', status: 'warning' };

    case 'ext.call_outcome': {
      const duration = payload.duration ? ` (${payload.duration})` : '';
      const goals = payload.goalsCount ? ` — ${payload.goalsCount} goals captured` : '';
      return {
        ...base,
        summary: `Coaching call completed${duration}${goals}`,
        detail: payload.conversationId ? `Conversation ID: ${payload.conversationId}` : undefined,
        status: 'success',
      };
    }

    case 'ext.webhook_received':
      return {
        ...base,
        summary: `Webhook received — ${(payload.source as string) || 'external event'}`,
        status: 'info',
      };

    case 'agent.paused':
      return { ...base, summary: 'Agent paused', status: 'warning' };

    case 'agent.resumed':
      return { ...base, summary: 'Agent resumed — standing by', status: 'info' };

    case 'agent.error':
      return {
        ...base,
        summary: `Agent error — ${(payload.message as string) || 'Check logs'}`,
        status: 'error',
      };

    default:
      return { ...base, summary: event.eventType.replace(/\./g, ' → '), status: 'info' };
  }
}

// ── Create Store ─────────────────────────────────────────────────
export const useWorldStore = create<WorldStore>()(
  subscribeWithSelector((set, get) => ({
    agents: Object.fromEntries(
      AGENT_IDS.map((id, i) => [id, createDefaultAgentState(id, i)])
    ) as Record<AgentId, AgentState>,
    activeConnections: 0,
    lastEventSequence: 0,
    lastEventTimestamp: new Date().toISOString(),
    systemStatus: 'disconnected',

    activityLog: [],

    analytics: {
      timeWindow: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        granularity: 'week',
      },
      metrics: {
        hoursInvested: { label: 'Hours Invested', value: 0, previousValue: 0, unit: 'hrs', trend: 0, trendDirection: 'flat', hasBaseline: false },
        kpiVelocity: { label: 'KPI Velocity', value: 0, previousValue: 0, unit: '%', trend: 0, trendDirection: 'flat', hasBaseline: false },
        calendarCompliance: { label: 'Calendar Compliance', value: 0, previousValue: 0, unit: '%', trend: 0, trendDirection: 'flat', hasBaseline: false },
        engagementScore: { label: 'Engagement Score', value: 0, previousValue: 0, unit: '/10', trend: 0, trendDirection: 'flat', hasBaseline: false },
      },
      agentROI: [],
      activityTimeline: [],
      isLoading: false,
    },

    eventQueue: [],

    getSnapshot: (): WorldSnapshot => {
      const state = get();
      return {
        agents: state.agents,
        activeConnections: state.activeConnections,
        lastEventSequence: state.lastEventSequence,
        lastEventTimestamp: state.lastEventTimestamp,
        systemStatus: state.systemStatus,
      };
    },

    setSystemStatus: (status) => set({ systemStatus: status }),

    updateAgentStatus: (agentId, status) =>
      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: { ...state.agents[agentId], status, lastActivity: new Date().toISOString() },
        },
      })),

    updateAgentPosition: (agentId, x, y) =>
      set((state) => ({
        agents: { ...state.agents, [agentId]: { ...state.agents[agentId], position: { x, y } } },
      })),

    setAgentTargetPosition: (agentId, target) =>
      set((state) => ({
        agents: { ...state.agents, [agentId]: { ...state.agents[agentId], targetPosition: target } },
      })),

    setAgentTask: (agentId, task) =>
      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...state.agents[agentId],
            currentTask: task,
            status: task ? 'thinking' : 'idle',
            lastActivity: new Date().toISOString(),
          },
        },
      })),

    incrementAgentTasks: (agentId) =>
      set((state) => ({
        agents: {
          ...state.agents,
          [agentId]: {
            ...state.agents[agentId],
            tasksCompleted: state.agents[agentId].tasksCompleted + 1,
          },
        },
      })),

    // Activity Log
    addActivityEntry: (entry) =>
      set((state) => {
        const newEntry: ActivityLogEntry = {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        return { activityLog: [newEntry, ...state.activityLog].slice(0, MAX_LOG_ENTRIES) };
      }),

    clearActivityLog: () => set({ activityLog: [] }),

    // Event Queue
    enqueueEvent: (event) =>
      set((state) => ({
        eventQueue: [...state.eventQueue, event],
        lastEventSequence: Math.max(state.lastEventSequence, event.sequence),
        lastEventTimestamp: event.timestamp,
      })),

    enqueueEvents: (events) =>
      set((state) => {
        const maxSeq = events.reduce((max, e) => Math.max(max, e.sequence), state.lastEventSequence);
        const lastTs = events.length > 0 ? events[events.length - 1].timestamp : state.lastEventTimestamp;
        return {
          eventQueue: [...state.eventQueue, ...events],
          lastEventSequence: maxSeq,
          lastEventTimestamp: lastTs,
        };
      }),

    processNextEvent: () => {
      const state = get();
      if (state.eventQueue.length === 0) return null;
      const [event, ...rest] = state.eventQueue;
      set({ eventQueue: rest });
      return event;
    },

    clearEventQueue: () => set({ eventQueue: [] }),

    // Analytics
    updateMetric: (key, update) =>
      set((state) => ({
        analytics: {
          ...state.analytics,
          metrics: { ...state.analytics.metrics, [key]: { ...state.analytics.metrics[key], ...update } },
        },
      })),

    setAgentROI: (agentROI) =>
      set((state) => ({ analytics: { ...state.analytics, agentROI } })),

    setActivityTimeline: (timeline) =>
      set((state) => ({ analytics: { ...state.analytics, activityTimeline: timeline } })),

    setAnalyticsLoading: (loading) =>
      set((state) => ({ analytics: { ...state.analytics, isLoading: loading } })),

    // Bulk
    applyWorldSnapshot: (snapshot) =>
      set({
        agents: snapshot.agents,
        activeConnections: snapshot.activeConnections,
        lastEventSequence: snapshot.lastEventSequence,
        lastEventTimestamp: snapshot.lastEventTimestamp,
        systemStatus: snapshot.systemStatus,
      }),

    // Event processor — logs every event, then updates agent state
    processEvent: (event) => {
      const { updateAgentStatus, setAgentTask, incrementAgentTasks, addActivityEntry } = get();

      const logEntry = buildLogEntry(event);
      if (logEntry) addActivityEntry(logEntry);

      if (!event.agentId) return;

      switch (event.eventType) {
        case 'task.received':
          updateAgentStatus(event.agentId, 'thinking');
          setAgentTask(event.agentId, {
            id: event.taskId || crypto.randomUUID(),
            type: (event.payload.taskType as string) || 'unknown',
            description: (event.payload.description as string) || 'Processing...',
            startedAt: event.timestamp,
            source: (event.payload.source as string) || 'system',
          });
          break;
        case 'task.started':
          updateAgentStatus(event.agentId, 'writing');
          break;
        case 'task.completed':
          updateAgentStatus(event.agentId, 'celebrating');
          incrementAgentTasks(event.agentId);
          setTimeout(() => { updateAgentStatus(event.agentId!, 'idle'); setAgentTask(event.agentId!, null); }, 2000);
          break;
        case 'task.failed':
          updateAgentStatus(event.agentId, 'error');
          setTimeout(() => { updateAgentStatus(event.agentId!, 'idle'); setAgentTask(event.agentId!, null); }, 3000);
          break;
        case 'task.escalated':
          updateAgentStatus(event.agentId, 'alerting');
          break;
        case 'ext.call_outcome':
          updateAgentStatus(event.agentId, 'celebrating');
          incrementAgentTasks(event.agentId);
          setTimeout(() => updateAgentStatus(event.agentId!, 'idle'), 2500);
          break;
        case 'ext.webhook_received':
          updateAgentStatus(event.agentId, 'thinking');
          setTimeout(() => updateAgentStatus(event.agentId!, 'idle'), 1500);
          break;
        case 'agent.paused':
          updateAgentStatus(event.agentId, 'offline');
          break;
        case 'agent.resumed':
          updateAgentStatus(event.agentId, 'idle');
          break;
        case 'agent.error':
          updateAgentStatus(event.agentId, 'error');
          break;
        default:
          break;
      }
    },
  }))
);

// ── Selectors ─────────────────────────────────────────────────────
export const selectAgents = (state: WorldStore) => state.agents;
export const selectAgent = (id: AgentId) => (state: WorldStore) => state.agents[id];
export const selectSystemStatus = (state: WorldStore) => state.systemStatus;
export const selectAnalytics = (state: WorldStore) => state.analytics;
export const selectTimeMachine = () => null; // Deprecated — TimeMachine UI removed
export const selectEventQueueLength = (state: WorldStore) => state.eventQueue.length;
export const selectActivityLog = (state: WorldStore) => state.activityLog;
