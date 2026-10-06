/* ================================================================
   ASAP — Analytics Engine (Real Estate KPI Edition)
   Enterprise-grade formulas for computing real-estate-specific KPIs:
   - Hours Invested (by category: prospecting, follow-up, showing, admin, training)
   - KPI Velocity (conversations/showings/offers vs targets)
   - Calendar Compliance (blocks completed / blocks scheduled)
   - WFUSA Engagement Score (weighted coaching effectiveness)
   - Week-over-Week Momentum
   - Agent System Uptime
   - Consistency Score (coefficient of variation over time)

   All calculations are grounded in measurable variables from:
   - Google Calendar events (scheduled blocks)
   - HITL check-in responses (block completion confirmation)
   - WFUSA voice call transcripts (energy, success score, KPIs)
   - Google Sheets (targets, Success Table, Agent Preferences)
   ================================================================ */

import type { AgentId, AgentROI, ASAPEvent, MetricSnapshot } from './types';
import { AGENT_PROFILES, ALL_AGENT_IDS } from './types';

// ── Calendar Block Category Configuration ───────────────────────
// Maps Google Calendar color codes to real estate activity categories
// Color codes match ASAP's calendar_agent color scheme

export type ActivityCategory =
  | 'prospecting'
  | 'follow_up'
  | 'showing'
  | 'admin'
  | 'training'
  | 'personal'
  | 'team'
  | 'client_service'
  | 'content'
  | 'uncategorized';

interface CategoryConfig {
  label: string;
  calendarColorIds: number[];   // Google Calendar color IDs
  hourWeight: number;           // Weight for hours invested breakdown
}

const CATEGORY_CONFIGS: Record<ActivityCategory, CategoryConfig> = {
  prospecting:    { label: 'Prospecting & Sales',   calendarColorIds: [9],     hourWeight: 1.0 },
  follow_up:     { label: 'Follow-Up',              calendarColorIds: [9],     hourWeight: 1.0 },
  showing:       { label: 'Showings',               calendarColorIds: [7],     hourWeight: 1.0 },
  admin:         { label: 'Admin & CRM',            calendarColorIds: [3],     hourWeight: 0.8 },
  training:      { label: 'Training & Learning',    calendarColorIds: [8],     hourWeight: 0.7 },
  personal:      { label: 'Personal',               calendarColorIds: [10],    hourWeight: 0.5 },
  team:          { label: 'Team',                    calendarColorIds: [6],     hourWeight: 0.9 },
  client_service: { label: 'Client Service',         calendarColorIds: [7],     hourWeight: 1.0 },
  content:       { label: 'Content Creation',        calendarColorIds: [5],     hourWeight: 0.6 },
  uncategorized: { label: 'Uncategorized',           calendarColorIds: [1, 11], hourWeight: 0.5 },
};

// ── KPI Target Defaults (from Success Table) ────────────────────
interface KPITargets {
  conversations: number;
  showings: number;
  offers: number;
}

const DEFAULT_KPI_TARGETS: KPITargets = {
  conversations: 25,
  showings: 5,
  offers: 2,
};

// ── Task-Type Configuration (for agent ROI) ─────────────────────
interface TaskTypeConfig {
  manualMinutes: number;
  slaMinutes: number;
  category: ActivityCategory;
}

const TASK_TYPE_CONFIGS: Record<string, TaskTypeConfig> = {
  weekly_sync:           { manualMinutes: 45,  slaMinutes: 5,  category: 'admin' },
  calendar_update:       { manualMinutes: 20,  slaMinutes: 3,  category: 'admin' },
  vector_sync:           { manualMinutes: 30,  slaMinutes: 4,  category: 'admin' },
  email_draft:           { manualMinutes: 25,  slaMinutes: 3,  category: 'follow_up' },
  plan_generation:       { manualMinutes: 90,  slaMinutes: 10, category: 'admin' },
  notification_dispatch: { manualMinutes: 15,  slaMinutes: 2,  category: 'admin' },
  voice_call:            { manualMinutes: 60,  slaMinutes: 8,  category: 'prospecting' },
  hitl_review:           { manualMinutes: 35,  slaMinutes: 5,  category: 'admin' },
  data_enrichment:       { manualMinutes: 40,  slaMinutes: 6,  category: 'admin' },
  report_generation:     { manualMinutes: 50,  slaMinutes: 7,  category: 'admin' },
  // Real estate specific
  prospecting_block:     { manualMinutes: 60,  slaMinutes: 60, category: 'prospecting' },
  follow_up_block:       { manualMinutes: 30,  slaMinutes: 30, category: 'follow_up' },
  showing_block:         { manualMinutes: 90,  slaMinutes: 90, category: 'showing' },
  admin_block:           { manualMinutes: 30,  slaMinutes: 30, category: 'admin' },
  training_block:        { manualMinutes: 60,  slaMinutes: 60, category: 'training' },
};

const DEFAULT_TASK_CONFIG: TaskTypeConfig = {
  manualMinutes: 30,
  slaMinutes: 5,
  category: 'uncategorized',
};

function getTaskConfig(taskType: string): TaskTypeConfig {
  return TASK_TYPE_CONFIGS[taskType] || DEFAULT_TASK_CONFIG;
}

// ── Completed Task Record ───────────────────────────────────────
export interface CompletedTask {
  taskId: string;
  agentId: AgentId;
  taskType: string;
  startedAt: number;   // epoch ms
  completedAt: number; // epoch ms
  durationMs: number;
  withinSla: boolean;
  manualMinutesSaved: number;
  category: ActivityCategory;
}

// ── Calendar Block Record (for compliance tracking) ─────────────
export interface CalendarBlock {
  eventId: string;
  category: ActivityCategory;
  scheduledStart: number;
  scheduledEnd: number;
  durationMinutes: number;
  completed: boolean;       // confirmed via HITL or inference
  completedAt?: number;
}

// ── WFUSA Call Record (for engagement scoring) ──────────────────
export interface WFUSACallRecord {
  callId: string;
  callCompleted: boolean;
  energyLevel: number;      // 1-10 self-reported
  successScore: number;     // AI-assessed from transcript 0-100
  calendarBlocksAdded: number;
  followUpsSet: number;
  timestamp: number;
  // KPI actuals from the call
  actualConversations: number;
  actualShowings: number;
  actualOffers: number;
}

// ── Agent Session Tracking ──────────────────────────────────────
interface AgentSession {
  firstActiveAt: number;
  lastActiveAt: number;
  totalActiveMs: number;
  activeStart: number | null;
  successfulExecutions: number;
  scheduledExecutions: number;
  errors: number;
}

// ── Timeline Bucket ─────────────────────────────────────────────
export interface TimelineBucket {
  timestamp: string;
  eventCount: number;
  taskCompletions: number;
  avgDurationMs: number;
  byAgent: Partial<Record<AgentId, number>>;
}

// ── Analytics Engine Class ──────────────────────────────────────
export class AnalyticsEngine {
  private completedTasks: CompletedTask[] = [];
  private pendingTasks: Map<string, { agentId: AgentId; taskType: string; startedAt: number }> = new Map();
  private agentSessions: Map<AgentId, AgentSession> = new Map();
  private eventLog: ASAPEvent[] = [];

  // Calendar & WFUSA tracking
  private calendarBlocks: CalendarBlock[] = [];
  private wfusaCalls: WFUSACallRecord[] = [];
  private kpiTargets: KPITargets = { ...DEFAULT_KPI_TARGETS };

  // Previous-period snapshot for trend calculation
  private previousPeriodBlocks: CalendarBlock[] = [];
  private previousPeriodCalls: WFUSACallRecord[] = [];
  private periodDurationMs = 7 * 24 * 60 * 60 * 1000; // 1 week default

  // Weekly score history for consistency calculation
  private weeklyComplianceHistory: number[] = [];

  constructor() {
    // Initialize agent sessions
    for (const id of ALL_AGENT_IDS) {
      this.agentSessions.set(id, {
        firstActiveAt: Date.now(),
        lastActiveAt: Date.now(),
        totalActiveMs: 0,
        activeStart: null,
        successfulExecutions: 0,
        scheduledExecutions: 0,
        errors: 0,
      });
    }
  }

  // ── Event Processing ──────────────────────────────────────────

  processEvent(event: ASAPEvent): void {
    this.eventLog.push(event);
    if (!event.agentId) return;

    const now = Date.now();
    const agentId = event.agentId;

    switch (event.eventType) {
      case 'task.received':
      case 'task.started': {
        const taskType = (event.payload.taskType as string) || 'unknown';
        const taskId = event.taskId || event.id;
        this.pendingTasks.set(taskId, {
          agentId,
          taskType,
          startedAt: new Date(event.timestamp).getTime(),
        });
        this.markAgentActive(agentId, now);
        this.incrementScheduledExecutions(agentId);
        break;
      }

      case 'task.completed': {
        const taskId = event.taskId || event.id;
        const pending = this.pendingTasks.get(taskId);
        if (pending) {
          const completedAt = new Date(event.timestamp).getTime();
          const durationMs = completedAt - pending.startedAt;
          const config = getTaskConfig(pending.taskType);
          const withinSla = durationMs <= config.slaMinutes * 60 * 1000;

          this.completedTasks.push({
            taskId,
            agentId: pending.agentId,
            taskType: pending.taskType,
            startedAt: pending.startedAt,
            completedAt,
            durationMs,
            withinSla,
            manualMinutesSaved: config.manualMinutes,
            category: config.category,
          });
          this.pendingTasks.delete(taskId);

          // Also record as a completed calendar block if it's a block type
          if (pending.taskType.endsWith('_block')) {
            this.calendarBlocks.push({
              eventId: taskId,
              category: config.category,
              scheduledStart: pending.startedAt,
              scheduledEnd: completedAt,
              durationMinutes: durationMs / 60000,
              completed: true,
              completedAt,
            });
          }
        } else {
          // Task started before engine
          const taskType = (event.payload.taskType as string) || 'unknown';
          const config = getTaskConfig(taskType);
          this.completedTasks.push({
            taskId,
            agentId,
            taskType,
            startedAt: now - 30000,
            completedAt: now,
            durationMs: 30000,
            withinSla: true,
            manualMinutesSaved: config.manualMinutes,
            category: config.category,
          });
        }
        this.markAgentActive(agentId, now);
        this.incrementSuccessfulExecutions(agentId);
        break;
      }

      case 'task.failed':
      case 'task.escalated': {
        const taskId = event.taskId || event.id;
        this.pendingTasks.delete(taskId);
        this.incrementErrors(agentId);
        break;
      }

      case 'ext.call_outcome': {
        // WFUSA voice call completed — extract engagement data
        const callRecord: WFUSACallRecord = {
          callId: event.id,
          callCompleted: true,
          // Never synthesize analytics values. If upstream didn't provide a
          // metric yet, keep it at 0 so the UI reflects "unknown / not captured"
          // instead of fake optimistic numbers.
          energyLevel: (event.payload.energyLevel as number) ?? 0,
          successScore: (event.payload.successScore as number) ?? 0,
          calendarBlocksAdded:
            (event.payload.eventsCreated as number) ??
            (event.payload.blocksAdded as number) ??
            0,
          followUpsSet:
            (event.payload.followUpsSet as number) ??
            (event.payload.follow_ups_set as number) ??
            0,
          timestamp: now,
          actualConversations:
            (event.payload.actualConversations as number) ??
            (event.payload.conversations as number) ??
            0,
          actualShowings:
            (event.payload.actualShowings as number) ??
            (event.payload.showings as number) ??
            0,
          actualOffers:
            (event.payload.actualOffers as number) ??
            (event.payload.offers as number) ??
            0,
        };
        this.wfusaCalls.push(callRecord);

        const config = getTaskConfig('voice_call');
        this.completedTasks.push({
          taskId: event.id,
          agentId,
          taskType: 'voice_call',
          startedAt: now - 15000,
          completedAt: now,
          durationMs: 15000,
          withinSla: true,
          manualMinutesSaved: config.manualMinutes,
          category: config.category,
        });
        this.markAgentActive(agentId, now);
        this.incrementSuccessfulExecutions(agentId);
        break;
      }

      case 'ext.email_sent':
      case 'ext.calendar_event_created': {
        const taskType = event.eventType.replace('ext.', '');
        const config = getTaskConfig(taskType);
        this.completedTasks.push({
          taskId: event.id,
          agentId,
          taskType,
          startedAt: now - 15000,
          completedAt: now,
          durationMs: 15000,
          withinSla: true,
          manualMinutesSaved: config.manualMinutes,
          category: config.category,
        });

        // Calendar event created → add to scheduled blocks
        if (event.eventType === 'ext.calendar_event_created') {
          const category = (event.payload.category as ActivityCategory) || 'uncategorized';
          const durationMinutes = (event.payload.durationMinutes as number) || 60;
          this.calendarBlocks.push({
            eventId: event.id,
            category,
            scheduledStart: now,
            scheduledEnd: now + durationMinutes * 60000,
            durationMinutes,
            completed: false,
          });
        }

        this.markAgentActive(agentId, now);
        this.incrementSuccessfulExecutions(agentId);
        break;
      }

      case 'agent.paused':
        this.markAgentInactive(agentId, now);
        break;

      case 'agent.resumed':
        this.markAgentActive(agentId, now);
        break;

      default:
        break;
    }
  }

  private markAgentActive(agentId: AgentId, now: number): void {
    const session = this.agentSessions.get(agentId);
    if (!session) return;
    session.lastActiveAt = now;
    if (session.activeStart === null) {
      session.activeStart = now;
    }
  }

  private markAgentInactive(agentId: AgentId, now: number): void {
    const session = this.agentSessions.get(agentId);
    if (!session) return;
    if (session.activeStart !== null) {
      session.totalActiveMs += now - session.activeStart;
      session.activeStart = null;
    }
  }

  private incrementScheduledExecutions(agentId: AgentId): void {
    const session = this.agentSessions.get(agentId);
    if (session) session.scheduledExecutions++;
  }

  private incrementSuccessfulExecutions(agentId: AgentId): void {
    const session = this.agentSessions.get(agentId);
    if (session) session.successfulExecutions++;
  }

  private incrementErrors(agentId: AgentId): void {
    const session = this.agentSessions.get(agentId);
    if (session) session.errors++;
  }

  // ── Real Estate KPI Computations ──────────────────────────────

  /**
   * Hours Invested = sum of completed calendar block durations / 60
   * Broken down by category (prospecting, follow-up, showing, admin, training)
   * For agents, the question is "did you put in the hours?" not "did AI save time?"
   */
  computeHoursInvested(): MetricSnapshot {
    const current = this.computeHoursFromBlocks(this.calendarBlocks);
    const previous = this.computeHoursFromBlocks(this.previousPeriodBlocks);
    return this.buildMetric('Hours Invested', current, previous, 'hrs');
  }

  private computeHoursFromBlocks(blocks: CalendarBlock[]): number {
    return blocks
      .filter(b => b.completed)
      .reduce((sum, b) => sum + b.durationMinutes, 0) / 60;
  }

  /**
   * Hours breakdown by category for detailed dashboard display
   */
  computeHoursByCategory(): Record<ActivityCategory, number> {
    const result: Record<string, number> = {};
    for (const cat of Object.keys(CATEGORY_CONFIGS) as ActivityCategory[]) {
      result[cat] = this.calendarBlocks
        .filter(b => b.completed && b.category === cat)
        .reduce((sum, b) => sum + b.durationMinutes / 60, 0);
    }
    return result as Record<ActivityCategory, number>;
  }

  /**
   * KPI Velocity = weighted average of actual/target ratios
   * conversations × 0.3 + showings × 0.4 + offers × 0.3
   *
   * Targets come from the Success Plan Sheet.
   * Actuals come from WFUSA voice call data.
   */
  computeKPIVelocity(): MetricSnapshot {
    const current = this.computeVelocityFromCalls(this.wfusaCalls);
    const previous = this.computeVelocityFromCalls(this.previousPeriodCalls);
    return this.buildMetric('KPI Velocity', current, previous, '%');
  }

  private computeVelocityFromCalls(calls: WFUSACallRecord[]): number {
    if (calls.length === 0) return 0;

    // Aggregate actuals from all calls in the period
    const totals = calls.reduce(
      (acc, call) => ({
        conversations: acc.conversations + call.actualConversations,
        showings: acc.showings + call.actualShowings,
        offers: acc.offers + call.actualOffers,
      }),
      { conversations: 0, showings: 0, offers: 0 }
    );

    const conversationVelocity = Math.min(200, (totals.conversations / this.kpiTargets.conversations) * 100);
    const showingVelocity = Math.min(200, (totals.showings / this.kpiTargets.showings) * 100);
    const offerVelocity = Math.min(200, (totals.offers / this.kpiTargets.offers) * 100);

    // Weighted composite: conversations 30%, showings 40%, offers 30%
    return conversationVelocity * 0.3 + showingVelocity * 0.4 + offerVelocity * 0.3;
  }

  /**
   * Calendar Compliance = (blocks_completed / blocks_scheduled) × 100
   * A block is "completed" if confirmed via HITL check-in OR
   * inferred from no reschedule/delete within the block's time window.
   */
  computeCalendarCompliance(): MetricSnapshot {
    const current = this.computeComplianceFromBlocks(this.calendarBlocks);
    const previous = this.computeComplianceFromBlocks(this.previousPeriodBlocks);
    return this.buildMetric('Calendar Compliance', current, previous, '%');
  }

  private computeComplianceFromBlocks(blocks: CalendarBlock[]): number {
    if (blocks.length === 0) return 0;
    const completed = blocks.filter(b => b.completed).length;
    return (completed / blocks.length) * 100;
  }

  /**
   * WFUSA Engagement Score = weighted composite:
   *   call_completed × 30 + energy_level × 20 + success_score × 20 +
   *   calendar_blocks_added × 15 + follow_ups_set × 15
   *
   * Normalized to 0-100 scale.
   */
  computeEngagementScore(): MetricSnapshot {
    const current = this.computeEngagementFromCalls(this.wfusaCalls);
    const previous = this.computeEngagementFromCalls(this.previousPeriodCalls);
    return this.buildMetric('Engagement Score', current, previous, '');
  }

  private computeEngagementFromCalls(calls: WFUSACallRecord[]): number {
    if (calls.length === 0) return 0;

    // Average engagement across all calls in the period
    const totalScore = calls.reduce((sum, call) => {
      const callCompletedScore = call.callCompleted ? 100 : 0;
      const energyScore = (call.energyLevel / 10) * 100;
      const successScoreNorm = call.successScore; // already 0-100
      const blocksScore = Math.min(100, (call.calendarBlocksAdded / 10) * 100);
      const followUpScore = Math.min(100, (call.followUpsSet / 5) * 100);

      return sum + (
        callCompletedScore * 0.30 +
        energyScore * 0.20 +
        successScoreNorm * 0.20 +
        blocksScore * 0.15 +
        followUpScore * 0.15
      );
    }, 0);

    return Math.round(totalScore / calls.length);
  }

  /**
   * Week-over-Week Momentum:
   * momentum = (this_week_velocity - last_week_velocity) / last_week × 100
   */
  computeMomentum(): number {
    const current = this.computeVelocityFromCalls(this.wfusaCalls);
    const previous = this.computeVelocityFromCalls(this.previousPeriodCalls);
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Agent ROI for each agent — adapted for real estate context:
   *   - tasksCompleted: count of tasks by this agent
   *   - hoursSaved: estimated human-equivalent time automated
   *   - uptime: (successful_executions / scheduled_executions) × 100
   *   - roi: hoursSaved / (estimatedActiveHours × $5/hr API cost)
   */
  computeAgentROI(): AgentROI[] {
    const now = Date.now();
    const COST_PER_HOUR = 5;

    return ALL_AGENT_IDS.map(agentId => {
      const agentTasks = this.completedTasks.filter(t => t.agentId === agentId);
      const tasksCompleted = agentTasks.length;
      const hoursSaved = agentTasks.reduce((s, t) => s + t.manualMinutesSaved, 0) / 60;

      // Uptime = successful / scheduled (agent reliability, not just time-based)
      const session = this.agentSessions.get(agentId);
      const scheduled = session?.scheduledExecutions ?? 0;
      const successful = session?.successfulExecutions ?? 0;
      const uptime = scheduled > 0 ? Math.min(100, (successful / scheduled) * 100) : 0;

      // ROI based on time savings vs API cost
      let activeMs = session?.totalActiveMs ?? 0;
      if (session?.activeStart !== null) {
        activeMs += now - (session?.activeStart ?? now);
      }
      const activeHours = activeMs / 3_600_000;
      const cost = activeHours * COST_PER_HOUR;
      const dollarValueSaved = hoursSaved * 50; // $50/hr avg real estate agent time value
      const roi = cost > 0 ? dollarValueSaved / cost : 0;

      return {
        agentId,
        agentName: AGENT_PROFILES[agentId].name,
        tasksCompleted,
        hoursSaved: Math.round(hoursSaved * 10) / 10,
        scheduled,
        uptime: Math.round(uptime),
        roi: Math.round(roi * 10) / 10,
      };
    });
  }

  /**
   * Activity Timeline — bucket events into 5-minute intervals
   */
  computeTimeline(bucketMinutes = 5, maxBuckets = 24): TimelineBucket[] {
    const bucketMs = bucketMinutes * 60 * 1000;
    const now = Date.now();
    const earliest = now - maxBuckets * bucketMs;

    const buckets: Map<number, TimelineBucket> = new Map();

    for (let i = 0; i < maxBuckets; i++) {
      const start = earliest + i * bucketMs;
      buckets.set(start, {
        timestamp: new Date(start).toISOString(),
        eventCount: 0,
        taskCompletions: 0,
        avgDurationMs: 0,
        byAgent: {},
      });
    }

    for (const event of this.eventLog) {
      const ts = new Date(event.timestamp).getTime();
      if (ts < earliest) continue;
      const bucketStart = earliest + Math.floor((ts - earliest) / bucketMs) * bucketMs;
      const bucket = buckets.get(bucketStart);
      if (!bucket) continue;
      bucket.eventCount++;
    }

    for (const task of this.completedTasks) {
      if (task.completedAt < earliest) continue;
      const bucketStart = earliest + Math.floor((task.completedAt - earliest) / bucketMs) * bucketMs;
      const bucket = buckets.get(bucketStart);
      if (!bucket) continue;
      bucket.taskCompletions++;
      bucket.byAgent[task.agentId] = (bucket.byAgent[task.agentId] || 0) + 1;
    }

    for (const task of this.completedTasks) {
      if (task.completedAt < earliest) continue;
      const bucketStart = earliest + Math.floor((task.completedAt - earliest) / bucketMs) * bucketMs;
      const bucket = buckets.get(bucketStart);
      if (!bucket) continue;
      if (bucket.taskCompletions > 0) {
        bucket.avgDurationMs = (bucket.avgDurationMs * (bucket.taskCompletions - 1) + task.durationMs) / bucket.taskCompletions;
      }
    }

    return Array.from(buckets.values());
  }

  /**
   * Sparkline data — last N data points for a metric.
   * Updated keys match the new real-estate KPIs.
   */
  computeSparkline(metricKey: 'hoursInvested' | 'kpiVelocity' | 'calendarCompliance' | 'engagementScore', points = 12): number[] {
    const now = Date.now();
    const windowMs = this.periodDurationMs;
    const stepMs = windowMs / points;
    const values: number[] = [];

    for (let i = 0; i < points; i++) {
      const cutoff = now - windowMs + (i + 1) * stepMs;

      switch (metricKey) {
        case 'hoursInvested': {
          const blocksInRange = this.calendarBlocks.filter(b => b.completed && (b.completedAt ?? b.scheduledEnd) <= cutoff);
          values.push(blocksInRange.reduce((s, b) => s + b.durationMinutes, 0) / 60);
          break;
        }
        case 'kpiVelocity': {
          const callsInRange = this.wfusaCalls.filter(c => c.timestamp <= cutoff);
          values.push(this.computeVelocityFromCalls(callsInRange));
          break;
        }
        case 'calendarCompliance': {
          const blocksInRange = this.calendarBlocks.filter(b => b.scheduledEnd <= cutoff);
          values.push(this.computeComplianceFromBlocks(blocksInRange));
          break;
        }
        case 'engagementScore': {
          const callsInRange = this.wfusaCalls.filter(c => c.timestamp <= cutoff);
          values.push(this.computeEngagementFromCalls(callsInRange));
          break;
        }
      }
    }

    // Normalize to 0-1
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    return values.map(v => (v - min) / range);
  }

  /**
   * Consistency Score — measures how evenly work is distributed across time.
   * Uses coefficient of variation of calendar compliance per time bucket.
   * 100 = perfectly even, 0 = all work in one burst.
   */
  computeConsistencyScore(bucketMinutes = 60): number {
    // If we have weekly compliance history, use that instead
    if (this.weeklyComplianceHistory.length >= 2) {
      const scores = this.weeklyComplianceHistory;
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (mean === 0) return 0;
      const variance = scores.reduce((sum, c) => sum + (c - mean) ** 2, 0) / scores.length;
      const cv = Math.sqrt(variance) / mean;
      return Math.max(0, Math.round((1 - cv / 2) * 100));
    }

    // Fallback to timeline-based calculation
    const timeline = this.computeTimeline(bucketMinutes, 24);
    const counts = timeline.map(b => b.taskCompletions);
    const nonZero = counts.filter(c => c > 0);
    if (nonZero.length < 2) return 0;

    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    const variance = nonZero.reduce((sum, c) => sum + (c - mean) ** 2, 0) / nonZero.length;
    const cv = Math.sqrt(variance) / mean;
    return Math.max(0, Math.round((1 - cv / 2) * 100));
  }

  /**
   * Velocity — tasks completed per hour over the current session.
   */
  computeVelocity(): number {
    // Use a rolling 24h window (not time-since-tab-open) to avoid inflated
    // spikes when historical events are replayed quickly after connect.
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const since = now - windowMs;
    const recent = this.completedTasks.filter(t => t.completedAt >= since).length;
    const hours = windowMs / 3_600_000;
    return Math.round((recent / hours) * 10) / 10;
  }

  // ── Seeding & Configuration ───────────────────────────────────

  /** Set KPI targets from Success Table */
  setKPITargets(targets: Partial<KPITargets>): void {
    this.kpiTargets = { ...this.kpiTargets, ...targets };
  }

  /** Add weekly compliance score to history */
  addWeeklyComplianceScore(score: number): void {
    this.weeklyComplianceHistory.push(score);
    // Keep last 12 weeks
    if (this.weeklyComplianceHistory.length > 12) {
      this.weeklyComplianceHistory = this.weeklyComplianceHistory.slice(-12);
    }
  }

  /** Seed previous-period data for realistic trend display */
  seedPreviousPeriod(_tasks: CompletedTask[], blocks?: CalendarBlock[], calls?: WFUSACallRecord[]): void {
    if (blocks) this.previousPeriodBlocks = blocks;
    if (calls) this.previousPeriodCalls = calls;
  }

  /** Seed calendar blocks (for demo or from real API data) */
  seedCalendarBlocks(blocks: CalendarBlock[]): void {
    this.calendarBlocks.push(...blocks);
  }

  /** Seed WFUSA call records (for demo or from real VAPI data) */
  seedWFUSACalls(calls: WFUSACallRecord[]): void {
    this.wfusaCalls.push(...calls);
  }

  /** Get all completed tasks */
  getCompletedTasks(): CompletedTask[] {
    return this.completedTasks;
  }

  /** Get pending task count */
  getPendingCount(): number {
    return this.pendingTasks.size;
  }

  // ── Utility ───────────────────────────────────────────────────

  private buildMetric(label: string, current: number, previous: number, unit: string): MetricSnapshot {
    // Only compute a trend when we have a real prior-period baseline to compare
    // against. Without one we report hasBaseline=false (the UI renders a neutral
    // "—") rather than inventing an optimistic "+100%".
    const hasBaseline = previous > 0;
    const trend = hasBaseline ? ((current - previous) / previous) * 100 : 0;

    const trendDirection: 'up' | 'down' | 'flat' =
      !hasBaseline || Math.abs(trend) < 1 ? 'flat' : trend > 0 ? 'up' : 'down';

    return {
      label,
      value: Math.round(current * 100) / 100,
      previousValue: Math.round(previous * 100) / 100,
      unit,
      trend: Math.round(Math.abs(trend) * 10) / 10,
      trendDirection,
      hasBaseline,
    };
  }
}
