/* ================================================================
   ANTI-GRAVITY ENGINE — Canonical Type Definitions
   The single source of truth for all data shapes across the system.
   ================================================================ */

// ── Agent Identity ───────────────────────────────────────────────
export type AgentId =
  | 'hermes'
  | 'wfusa'
  | 'calendar'
  | 'asap_router'
  | 'vector_memory'
  | 'planning_engine'
  | 'hitl_monitor';

import React from 'react';
import { Crown, Headset, CalendarCheck, TreeStructure, Brain, Strategy, ShieldCheck } from '@phosphor-icons/react';

export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  icon: React.ReactNode;     // React component
  color: string;     // HSL accent color
  description: string;
  /** Pixel-office sprite mapping (char_<palette>.png, optional hue shift). */
  pixel: { palette: number; hueShift: number; protagonist?: boolean };
}

export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  hermes: {
    id: 'hermes',
    name: 'Hermes',
    role: 'Chief of Staff',
    icon: <Crown weight="duotone" size={24} />,
    color: 'hsl(38, 92%, 60%)',
    description: 'The protagonist — runs the plan and directs the staff.',
    pixel: { palette: 0, hueShift: 0, protagonist: true },
  },
  wfusa: {
    id: 'wfusa',
    name: 'F.U.S.C',
    role: 'Follow Up Success Coach',
    icon: <Headset weight="duotone" size={24} />,
    color: 'hsl(20, 55%, 55%)',
    description: 'Weekly Follow-Up Success Agent — Voice coaching & plan optimization',
    pixel: { palette: 1, hueShift: 0 },
  },
  calendar: {
    id: 'calendar',
    name: 'Calendar Agent',
    role: 'Scheduler',
    icon: <CalendarCheck weight="duotone" size={24} />,
    color: 'hsl(210, 70%, 60%)',
    description: 'Programs 42 color-coded calendar events per week',
    pixel: { palette: 2, hueShift: 0 },
  },
  asap_router: {
    id: 'asap_router',
    name: 'ASAP Router',
    role: 'Operations Manager',
    icon: <TreeStructure weight="duotone" size={24} />,
    color: 'hsl(280, 60%, 60%)',
    description: 'ASAP Router Intelligence Agent — Routes tasks to specialists',
    pixel: { palette: 3, hueShift: 0 },
  },
  vector_memory: {
    id: 'vector_memory',
    name: 'Memory Agent',
    role: 'Data Archivist',
    icon: <Brain weight="duotone" size={24} />,
    color: 'hsl(145, 55%, 50%)',
    description: 'WFUSA Vector Store — aggregates weekly performance data and embeds it into long-term semantic memory (Pinecone)',
    pixel: { palette: 4, hueShift: 0 },
  },
  planning_engine: {
    id: 'planning_engine',
    name: 'Strategic Planner',
    role: 'MSP Engine',
    icon: <Strategy weight="duotone" size={24} />,
    color: 'hsl(330, 60%, 55%)',
    description: 'Monthly Strategic Planner — Decomposes goals into tactical blueprints',
    pixel: { palette: 5, hueShift: 0 },
  },
  hitl_monitor: {
    id: 'hitl_monitor',
    name: 'HITL Monitor',
    role: 'Alert Operator',
    icon: <ShieldCheck weight="duotone" size={24} />,
    color: 'hsl(0, 65%, 55%)',
    description: 'Human-in-the-Loop notification system — Morning briefings & evening check-ins',
    pixel: { palette: 0, hueShift: 140 },
  },
};

export const ALL_AGENT_IDS: AgentId[] = Object.keys(AGENT_PROFILES) as AgentId[];

// ── Agent State Machine ──────────────────────────────────────────
export type AgentStatus =
  | 'idle'
  | 'walking'
  | 'thinking'
  | 'calling'
  | 'writing'
  | 'alerting'
  | 'celebrating'
  | 'error'
  | 'offline';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  position: { x: number; y: number };
  targetPosition: { x: number; y: number } | null;
  currentTask: TaskInfo | null;
  lastActivity: string;    // ISO timestamp
  tasksCompleted: number;
  uptime: number;          // percentage 0-100
  animationFrame: number;
  animationTime: number;
}

export interface TaskInfo {
  id: string;
  type: string;
  description: string;
  startedAt: string;
  source: string;
}

// ── Events (from ASAP Backend) ───────────────────────────────────
export type EventCategory = 'agent' | 'task' | 'external' | 'system';

export interface ASAPEvent {
  id: string;
  tenantId: string;
  sequence: number;
  eventType: string;
  eventCategory: EventCategory;
  agentId: AgentId | null;
  taskId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Specific event types
export type AgentLifecycleEventType =
  | 'agent.spawned'
  | 'agent.configured'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.error';

export type TaskEventType =
  | 'task.received'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.escalated';

export type ExternalEventType =
  | 'ext.webhook_received'
  | 'ext.vector_synced'
  | 'ext.calendar_event_created'
  | 'ext.call_outcome'
  | 'ext.email_sent';

export type SystemEventType =
  | 'system.scheduler_fired'
  | 'system.snapshot_created'
  | 'system.error';

// ── World State ──────────────────────────────────────────────────
export interface WorldSnapshot {
  agents: Record<AgentId, AgentState>;
  activeConnections: number;
  lastEventSequence: number;
  lastEventTimestamp: string;
  systemStatus: 'connected' | 'reconnecting' | 'disconnected';
}

// ── Analytics ────────────────────────────────────────────────────
export type TimeGranularity = 'month' | 'week' | 'day';

export interface TimeWindow {
  start: string;
  end: string;
  granularity: TimeGranularity;
}

export interface MetricSnapshot {
  label: string;
  value: number;
  previousValue: number;
  unit: string;
  trend: number;       // percentage change
  trendDirection: 'up' | 'down' | 'flat';
  hasBaseline: boolean; // false when there is no prior-period data to compare against
}

export interface AgentROI {
  agentId: AgentId;
  agentName: string;
  tasksCompleted: number;
  hoursSaved: number;
  scheduled: number;   // scheduled executions; 0 means no reliability data yet
  uptime: number;
  roi: number;
}

export interface TimelineBucket {
  timestamp: string;
  eventCount: number;
  taskCompletions: number;
  avgDurationMs: number;
  byAgent: Partial<Record<AgentId, number>>;
}

export interface AnalyticsState {
  timeWindow: TimeWindow;
  metrics: {
    hoursInvested: MetricSnapshot;
    kpiVelocity: MetricSnapshot;
    calendarCompliance: MetricSnapshot;
    engagementScore: MetricSnapshot;
  };
  agentROI: AgentROI[];
  activityTimeline: TimelineBucket[];
  isLoading: boolean;
}

// ── WebSocket Protocol ───────────────────────────────────────────
export interface WSClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'replay_request' | 'hitl_response' | 'ping';
  payload: {
    tenantId?: string;
    timeWindow?: { start: string; end: string };
    lastSequence?: number;
    hitlDecision?: { taskId: string; decision: string };
  };
}

export interface WSServerMessage {
  type: 'event' | 'snapshot' | 'replay_batch' | 'error' | 'pong';
  sequence: number;
  timestamp: string;
  payload: ASAPEvent | WorldSnapshot | ASAPEvent[] | { code: string; message: string };
}

// ── Time Machine ─────────────────────────────────────────────────
export interface TimeMachineState {
  mode: 'live' | 'replay';
  currentTime: string;
  playbackSpeed: number;  // 1 = real-time, 2 = 2x, etc.
  isPlaying: boolean;
  zoomLevel: TimeGranularity;
}
