/* ================================================================
   ASAP — Metric Card Component
   Animated counter with trend indicator, real sparkline data,
   and glass styling.
   ================================================================ */

import { useEffect, useRef, useState } from 'react';
import type { MetricSnapshot } from '../engine/types';
import './MetricCard.css';

interface MetricCardProps {
  metric: MetricSnapshot;
  icon: React.ReactNode;
  accentColor?: string;
  format?: 'number' | 'currency' | 'percentage';
  sparklineData?: number[];
}

// ── Animated Counter Hook ────────────────────────────────────────
function useAnimatedValue(target: number, duration = 800): number {
  const [display, setDisplay] = useState(target);
  const startRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = startRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        startRef.current = target;
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return display;
}

// ── Format Value ─────────────────────────────────────────────────
function formatValue(value: number, format: MetricCardProps['format']): string {
  switch (format) {
    case 'currency':
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    case 'percentage':
      return `${value.toFixed(1)}%`;
    default:
      if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
      return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  }
}

// ── Build sparkline SVG path from normalized data ────────────────
function buildSparklinePath(data: number[], width: number, height: number): { line: string; area: string } {
  if (data.length < 2) {
    return { line: '', area: '' };
  }

  const stepX = width / (data.length - 1);
  const padding = 2; // top/bottom padding
  const usableH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: i * stepX,
    y: padding + (1 - v) * usableH,
  }));

  // Build smooth curve using quadratic bezier
  let line = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    line += ` Q${midX},${prev.y} ${midX},${(prev.y + curr.y) / 2}`;
    if (i === points.length - 1) {
      line += ` T${curr.x},${curr.y}`;
    }
  }

  // Area: same path but close to bottom
  const area = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return { line, area };
}

// ── Component ────────────────────────────────────────────────────
export default function MetricCard({ metric, icon, accentColor, format = 'number', sparklineData }: MetricCardProps) {
  const animatedValue = useAnimatedValue(metric.value);
  const trendIcon = metric.trendDirection === 'up' ? '↑' : metric.trendDirection === 'down' ? '↓' : '→';

  const sparkline = sparklineData && sparklineData.length >= 2
    ? buildSparklinePath(sparklineData, 120, 32)
    : null;

  return (
    <div className="metric-card glass-panel animate-fade-in" style={{ '--accent': accentColor } as React.CSSProperties}>
      <div className="metric-card__header">
        <span className="metric-card__icon">{icon}</span>
        {metric.hasBaseline ? (
          <div className={`metric-trend metric-trend--${metric.trendDirection}`}>
            {trendIcon} {Math.abs(metric.trend).toFixed(1)}%
          </div>
        ) : (
          // No prior-period data to compare against — show a neutral marker
          // instead of a fabricated trend.
          <div
            className="metric-trend metric-trend--flat"
            style={{ color: 'var(--text-tertiary, #64748b)', opacity: 0.7 }}
            title="No prior-period data to compare yet"
          >
            —
          </div>
        )}
      </div>

      <div className="metric-card__value-row">
        <span className="metric-value">{formatValue(animatedValue, format)}</span>
        {metric.unit && format === 'number' && (
          <span className="metric-card__unit">{metric.unit}</span>
        )}
      </div>

      <div className="metric-card__label">{metric.label}</div>

      {/* Real sparkline from analytics engine data */}
      <div className="metric-card__sparkline">
        <svg viewBox="0 0 120 32" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`spark-${metric.label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor || 'var(--brand-400)'} stopOpacity="0.3" />
              <stop offset="100%" stopColor={accentColor || 'var(--brand-400)'} stopOpacity="0" />
            </linearGradient>
          </defs>
          {sparkline ? (
            <>
              <path
                d={sparkline.line}
                fill="none"
                stroke={accentColor || 'var(--brand-400)'}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d={sparkline.area}
                fill={`url(#spark-${metric.label})`}
              />
            </>
          ) : (
            // No real sparkline data yet — render a flat baseline rather than a
            // fabricated upward curve that implies growth that hasn't happened.
            <line
              x1="0"
              y1="30"
              x2="120"
              y2="30"
              stroke={accentColor || 'var(--brand-400)'}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.15"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
