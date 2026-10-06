/* ================================================================
   ASAP — Analytics Dashboard (Tab 2)
   Surfaces agent ROI, hours saved, pipeline value, SLA metrics,
   velocity, consistency scoring, and activity timeline.
   All data computed by AnalyticsEngine with real-world formulas.
   ================================================================ */

import { useState, useEffect, useMemo } from 'react';
import { House, ChartBar, CalendarCheck, Target } from '@phosphor-icons/react';
import { useWorldStore, selectAnalytics } from '../engine/WorldStore';
import { AGENT_PROFILES } from '../engine/types';
import type { TimelineBucket } from '../engine/types';
import { getAnalyticsEngine } from '../engine/bridge';
import MetricCard from './MetricCard';
import './AnalyticsDashboard.css';

const METRIC_CONFIG = [
  { key: 'hoursInvested' as const, icon: <House weight="duotone" size={26} />, color: 'hsl(20, 55%, 55%)', format: 'number' as const },
  { key: 'kpiVelocity' as const, icon: <ChartBar weight="duotone" size={26} />, color: 'hsl(145, 55%, 50%)', format: 'percentage' as const },
  { key: 'calendarCompliance' as const, icon: <CalendarCheck weight="duotone" size={26} />, color: 'hsl(210, 70%, 60%)', format: 'percentage' as const },
  { key: 'engagementScore' as const, icon: <Target weight="duotone" size={26} />, color: 'hsl(280, 60%, 60%)', format: 'number' as const },
];

export default function AnalyticsDashboard() {
  const analytics = useWorldStore(selectAnalytics);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  // Refresh sparkline data periodically
  useEffect(() => {
    function updateSparklines() {
      const engine = getAnalyticsEngine();
      setSparklines({
        hoursInvested: engine.computeSparkline('hoursInvested'),
        kpiVelocity: engine.computeSparkline('kpiVelocity'),
        calendarCompliance: engine.computeSparkline('calendarCompliance'),
        engagementScore: engine.computeSparkline('engagementScore'),
      });
    }
    updateSparklines();
    const interval = setInterval(updateSparklines, 3000);
    return () => clearInterval(interval);
  }, []);

  // Compute velocity and consistency from engine
  const [velocity, setVelocity] = useState(0);
  const [consistency, setConsistency] = useState(0);
  useEffect(() => {
    function updateScores() {
      const engine = getAnalyticsEngine();
      setVelocity(engine.computeVelocity());
      setConsistency(engine.computeConsistencyScore());
    }
    updateScores();
    const interval = setInterval(updateScores, 3000);
    return () => clearInterval(interval);
  }, []);

  // Timeline bar chart max value for scaling
  const timelineMax = useMemo(() => {
    return Math.max(1, ...analytics.activityTimeline.map(b => b.taskCompletions));
  }, [analytics.activityTimeline]);

  return (
    <div className="analytics-dashboard">
      {/* ── KPI Metric Cards ── */}
      <section className="analytics-section">
        <h2 className="analytics-section__title text-label">Key Performance Indicators</h2>
        <div className="analytics-metrics-grid stagger-children">
          {METRIC_CONFIG.map(({ key, icon, color, format }) => (
            <MetricCard
              key={key}
              metric={analytics.metrics[key]}
              icon={icon}
              accentColor={color}
              format={format}
              sparklineData={sparklines[key]}
            />
          ))}
        </div>
      </section>

      {/* ── Velocity & Consistency Scores ── */}
      <section className="analytics-section animate-fade-in" style={{ animationDelay: '100ms' }}>
        <h2 className="analytics-section__title text-label">Performance Scoring</h2>
        <div className="analytics-scores-grid">
          <div className="glass-panel analytics-score-card">
            <div className="analytics-score-card__header">
              <span className="analytics-score-card__label">Throughput Velocity</span>
              <span className="analytics-score-card__sublabel">tasks / hour</span>
            </div>
            <div className="analytics-score-card__value">{velocity.toFixed(1)}</div>
            <div className="analytics-score-card__bar">
              <div
                className="analytics-score-card__bar-fill analytics-score-card__bar-fill--velocity"
                style={{ width: `${Math.min(100, velocity * 10)}%` }}
              />
            </div>
            <span className="analytics-score-card__explanation">
              Measures how many tasks are completed per hour of system operation.
              Higher velocity = the agent fleet is processing requests efficiently.
            </span>
          </div>

          <div className="glass-panel analytics-score-card">
            <div className="analytics-score-card__header">
              <span className="analytics-score-card__label">Consistency Score</span>
              <span className="analytics-score-card__sublabel">0-100</span>
            </div>
            <div className="analytics-score-card__value">{consistency}</div>
            <div className="analytics-score-card__bar">
              <div
                className={`analytics-score-card__bar-fill analytics-score-card__bar-fill--consistency ${consistency < 50 ? 'analytics-score-card__bar-fill--low' : ''}`}
                style={{ width: `${consistency}%` }}
              />
            </div>
            <span className="analytics-score-card__explanation">
              Measures how evenly your work is distributed over time (coefficient of variation across weekly compliance scores).
              100 = perfectly consistent execution, lower = bursts with idle gaps.
            </span>
          </div>
        </div>
      </section>

      {/* ── Agent ROI Table ── */}
      <section className="analytics-section animate-fade-in" style={{ animationDelay: '200ms' }}>
        <h2 className="analytics-section__title text-label">Agent ROI Breakdown</h2>
        <div className="glass-panel agent-roi-table">
          <div className="agent-roi-header">
            <span>Agent</span>
            <span>Tasks</span>
            <span>Hours Saved</span>
            <span>Uptime</span>
            <span>ROI</span>
          </div>
          {analytics.agentROI.map((agent) => {
            const profile = AGENT_PROFILES[agent.agentId];
            return (
              <div key={agent.agentId} className="agent-roi-row">
                <div className="agent-roi-name">
                  <span className="agent-roi-icon">{profile.icon}</span>
                  <div>
                    <div className="agent-roi-name__primary">{profile.name}</div>
                    <div className="agent-roi-name__role">{profile.role}</div>
                  </div>
                </div>
                <span className="text-mono">{agent.tasksCompleted}</span>
                <span className="text-mono">{agent.hoursSaved.toFixed(1)}h</span>
                <div className="agent-roi-uptime">
                  <div className="agent-roi-uptime__bar">
                    <div
                      className="agent-roi-uptime__fill"
                      style={{ width: `${agent.uptime}%` }}
                    />
                  </div>
                  <span className="text-mono">{agent.uptime}%</span>
                </div>
                <span className={`agent-roi-multiplier ${agent.roi > 0 ? 'text-brand' : ''}`}>
                  {agent.roi > 0 ? `${agent.roi.toFixed(1)}x` : '—'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="analytics-formula-note">
          ROI = (Hours Saved × $50/hr agent time) / (Est. API Cost at $5/hr active time).
          Hours Saved = estimated human-equivalent time per automated task type.
        </p>
      </section>

      {/* ── Activity Timeline ── */}
      <section className="analytics-section animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h2 className="analytics-section__title text-label">Activity Timeline</h2>
        <div className="glass-panel analytics-timeline">
          {analytics.activityTimeline.length > 0 ? (
            <div className="analytics-timeline__chart">
              <div className="analytics-timeline__bars">
                {analytics.activityTimeline.map((bucket, i) => (
                  <TimelineBar
                    key={i}
                    bucket={bucket}
                    maxValue={timelineMax}
                    index={i}
                  />
                ))}
              </div>
              <div className="analytics-timeline__axis">
                <span>{formatTimeLabel(analytics.activityTimeline[0]?.timestamp)}</span>
                <span>
                  {formatTimeLabel(analytics.activityTimeline[Math.floor(analytics.activityTimeline.length / 2)]?.timestamp)}
                </span>
                <span>Now</span>
              </div>
            </div>
          ) : (
            <div className="analytics-timeline-empty">
              <p className="text-body">Timeline will populate as events stream in.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Timeline Bar Component ──────────────────────────────────────
function TimelineBar({ bucket, maxValue }: {
  bucket: TimelineBucket;
  maxValue: number;
  index?: number;
}) {
  const height = maxValue > 0 ? (bucket.taskCompletions / maxValue) * 100 : 0;
  const eventHeight = maxValue > 0 ? Math.min(100, (bucket.eventCount / (maxValue * 3)) * 100) : 0;

  // Color intensity based on completions
  const hasActivity = bucket.taskCompletions > 0 || bucket.eventCount > 0;

  return (
    <div className="timeline-bar-container" title={`${bucket.taskCompletions} tasks, ${bucket.eventCount} events`}>
      {/* Event count (lighter background bar) */}
      <div
        className="timeline-bar timeline-bar--events"
        style={{ height: `${eventHeight}%`, opacity: hasActivity ? 0.3 : 0.05 }}
      />
      {/* Task completions (foreground bar) */}
      <div
        className={`timeline-bar timeline-bar--tasks ${!hasActivity ? 'timeline-bar--empty' : ''}`}
        style={{ height: `${Math.max(height, hasActivity ? 4 : 1)}%` }}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────
function formatTimeLabel(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
