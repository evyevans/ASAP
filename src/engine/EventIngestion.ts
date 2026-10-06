/* ================================================================
   ANTI-GRAVITY — WebSocket Event Ingestion Layer
   Handles connection, reconnection, sequence tracking, normalization,
   and priority queuing. Completely decoupled from the render loop.
   ================================================================ */

import type { ASAPEvent, WSClientMessage, WSServerMessage } from './types';
import { AnalyticsEngine } from './AnalyticsEngine';
import type { WFUSACallRecord } from './AnalyticsEngine';
import { useWorldStore } from './WorldStore';

// ── Configuration ────────────────────────────────────────────────
interface EventIngestionConfig {
  url: string;
  tenantId: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Event) => void;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
}

const DEFAULT_CONFIG: Partial<EventIngestionConfig> = {
  maxReconnectAttempts: 20,
  reconnectBaseDelay: 1000,
  maxReconnectDelay: 30000,
  heartbeatInterval: 25000, // Cloud Run timeout is 3600s; ping every 25s
};

// ── Event Ingestion Manager ──────────────────────────────────────
export class EventIngestionManager {
  private ws: WebSocket | null = null;
  private config: Required<EventIngestionConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastSequence = 0;
  private isDestroyed = false;

  constructor(config: EventIngestionConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      onConnected: () => {},
      onDisconnected: () => {},
      onError: () => {},
      ...config,
    } as Required<EventIngestionConfig>;
  }

  // ── Public API ──

  connect(): void {
    if (this.isDestroyed) return;
    this.createConnection();
  }

  disconnect(): void {
    this.isDestroyed = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    useWorldStore.getState().setSystemStatus('disconnected');
  }

  sendMessage(message: WSClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  getLastSequence(): number {
    return this.lastSequence;
  }

  // ── Connection Management ──

  private createConnection(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const url = new URL(this.config.url);
      // Append last sequence for resumption
      if (this.lastSequence > 0) {
        url.searchParams.set('last_sequence', String(this.lastSequence));
      }

      this.ws = new WebSocket(url.toString());
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (err) {
      console.error('[EventIngestion] Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    console.log('[EventIngestion] Connected');
    this.reconnectAttempts = 0;
    useWorldStore.getState().setSystemStatus('connected');
    this.config.onConnected();

    // Subscribe to tenant events
    this.sendMessage({
      type: 'subscribe',
      payload: {
        tenantId: this.config.tenantId,
        lastSequence: this.lastSequence,
      },
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WSServerMessage = JSON.parse(event.data);
      this.processServerMessage(message);
    } catch (err) {
      console.error('[EventIngestion] Failed to parse message:', err);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[EventIngestion] Disconnected (code: ${event.code}, reason: ${event.reason})`);
    this.stopHeartbeat();
    useWorldStore.getState().setSystemStatus('reconnecting');
    this.config.onDisconnected();

    if (!this.isDestroyed && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private handleError(event: Event): void {
    console.error('[EventIngestion] WebSocket error:', event);
    this.config.onError(event);
  }

  // ── Message Processing ──

  private processServerMessage(message: WSServerMessage): void {
    const store = useWorldStore.getState();

    switch (message.type) {
      case 'event': {
        const event = message.payload as ASAPEvent;
        this.lastSequence = Math.max(this.lastSequence, message.sequence);
        store.enqueueEvent(event);
        // Process immediately (simulation tick will handle batching)
        store.processEvent(event);
        break;
      }

      case 'replay_batch': {
        const events = message.payload as ASAPEvent[];
        if (events.length > 0) {
          this.lastSequence = Math.max(
            this.lastSequence,
            events[events.length - 1].sequence
          );
          store.enqueueEvents(events);
          // Process batch
          events.forEach((event) => store.processEvent(event));
        }
        break;
      }

      case 'snapshot': {
        const snapshot = message.payload as any;
        store.applyWorldSnapshot(snapshot);
        break;
      }

      case 'pong':
        // Heartbeat acknowledged
        break;

      case 'error': {
        const error = message.payload as { code: string; message: string };
        console.error(`[EventIngestion] Server error: ${error.code} — ${error.message}`);
        break;
      }
    }
  }

  // ── Reconnection ──

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[EventIngestion] Max reconnect attempts reached');
      useWorldStore.getState().setSystemStatus('disconnected');
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts) +
        Math.random() * 1000,
      this.config.maxReconnectDelay
    );

    console.log(
      `[EventIngestion] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.createConnection();
    }, delay);
  }

  // ── Heartbeat ──

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: 'ping', payload: {} });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Cleanup ──

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ── Live Event Bridge (wraps WS + AnalyticsEngine for live mode) ──
export class LiveEventBridge {
  private manager: EventIngestionManager | null = null;
  private analyticsEngine = new AnalyticsEngine();
  private metricsIntervalId: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  getAnalyticsEngine(): AnalyticsEngine {
    return this.analyticsEngine;
  }

  /**
   * Check if the backend WebSocket is available.
   * Tries an HTTP health check first.
   */
  static async isBackendAvailable(
    baseUrl = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  ): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Connect to the backend WebSocket.
   */
  async connect(
    wsUrl?: string,
    tenantId?: string,
    authToken?: string,
  ): Promise<boolean> {
    const resolvedWs =
      wsUrl ??
      import.meta.env.VITE_WS_URL ??
      `${(import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/^http/, 'ws')}/ws/events`;
    const resolvedTenant = tenantId ?? import.meta.env.VITE_TENANT_ID ?? 'default';
    try {
      const engine = this.analyticsEngine;

      this.manager = new EventIngestionManager({
        url: resolvedWs,
        tenantId: resolvedTenant,
        onConnected: () => {
          this._isConnected = true;
          this.startMetricsPush();
          this._seedFromAnalyticsSummary(engine, resolvedTenant, authToken).catch(() => {});
        },
        onDisconnected: () => {
          this._isConnected = false;
        },
      });

      // Patch WorldStore.processEvent to also feed the AnalyticsEngine
      const originalProcessEvent = useWorldStore.getState().processEvent;
      const wrappedProcessEvent = (event: ASAPEvent) => {
        originalProcessEvent(event);
        engine.processEvent(event);
      };
      useWorldStore.setState({ processEvent: wrappedProcessEvent });

      this.manager.connect();
      return true;
    } catch (err) {
      console.error('[LiveEventBridge] Failed to connect:', err);
      return false;
    }
  }

  /**
   * Fetch 7-day analytics summary from the REST API and seed the engine
   * with historical WFUSA call records and completed task data.
   * Called once after WebSocket connects — silently no-ops on error.
   */
  private async _seedFromAnalyticsSummary(
    engine: AnalyticsEngine,
    tenantId?: string,
    authToken?: string,
  ): Promise<void> {
    const baseUrl = import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
    const headers: Record<string, string> = {};
    if (tenantId && tenantId !== 'default') {
      headers['x-tenant-id'] = tenantId;
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    try {
      const resp = await fetch(`${baseUrl}/api/analytics/summary`, {
        signal: AbortSignal.timeout(5000),
        headers,
      });
      if (!resp.ok) return;
      const data = await resp.json();

      // Seed WFUSA call records so KPI Velocity + Engagement Score show real values
      if (Array.isArray(data.wfusaCalls) && data.wfusaCalls.length > 0) {
        const calls: WFUSACallRecord[] = data.wfusaCalls.map((c: {
          callId: string; successScore: number; eventsCreated: number; timestamp: number;
          actualConversations?: number; actualShowings?: number; actualOffers?: number;
          energyLevel?: number;
        }) => ({
          callId: c.callId,
          callCompleted: true,
          energyLevel: c.energyLevel ?? 0,
          successScore: c.successScore || 0,
          calendarBlocksAdded: c.eventsCreated || 0,
          followUpsSet: Math.max(0, Math.round((c.eventsCreated || 0) / 3)),
          timestamp: c.timestamp || 0,
          actualConversations: c.actualConversations ?? 0,
          actualShowings: c.actualShowings ?? 0,
          actualOffers: c.actualOffers ?? 0,
        }));
        engine.seedWFUSACalls(calls);
      }

      // Replay recent completed/failed events so Agent ROI table shows real task counts
      if (Array.isArray(data.recentEvents)) {
        for (const e of data.recentEvents) {
          const synthetic: ASAPEvent = {
            id: `seed-${e.createdAt}-${e.agentId}`,
            tenantId: 'default',
            sequence: 0,
            eventType: e.eventType,
            eventCategory: 'task',
            agentId: e.agentId,
            taskId: `seed-task-${e.createdAt}`,
            timestamp: e.createdAt,
            payload: e.payload || {},
          };
          engine.processEvent(synthetic);
        }
      }

      console.log(
        `[LiveEventBridge] Seeded analytics: ${data.totalTasksCompleted} historical tasks, ` +
        `${(data.wfusaCalls || []).length} WFUSA calls`
      );
    } catch {
      // Silent — never block the UI
    }
  }

  disconnect(): void {
    this.manager?.disconnect();
    this.stopMetricsPush();
    this._isConnected = false;
  }

  private startMetricsPush(): void {
    this.stopMetricsPush();
    this.pushMetrics();
    this.metricsIntervalId = setInterval(() => this.pushMetrics(), 2000);
  }

  private stopMetricsPush(): void {
    if (this.metricsIntervalId) {
      clearInterval(this.metricsIntervalId);
      this.metricsIntervalId = null;
    }
  }

  private pushMetrics(): void {
    const store = useWorldStore.getState();
    const engine = this.analyticsEngine;

    store.updateMetric('hoursInvested', engine.computeHoursInvested());
    store.updateMetric('kpiVelocity', engine.computeKPIVelocity());
    store.updateMetric('calendarCompliance', engine.computeCalendarCompliance());
    store.updateMetric('engagementScore', engine.computeEngagementScore());

    store.setAgentROI(engine.computeAgentROI());
    store.setActivityTimeline(engine.computeTimeline());
  }
}
