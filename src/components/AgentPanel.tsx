/* ================================================================
   ANTI-GRAVITY — Agent Detail Panel (Sidebar)
   Shows detailed info when an agent orb is clicked in the canvas.
   ================================================================ */

import { useWorldStore, selectAgent, selectAnalytics } from '../engine/WorldStore';
import { AGENT_PROFILES, type AgentId, type AgentStatus } from '../engine/types';
import './AgentPanel.css';

interface AgentPanelProps {
  agentId: AgentId;
  onClose: () => void;
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; className: string }> = {
  idle:        { label: 'Standing By',        className: 'status--idle' },
  walking:     { label: 'Moving',             className: 'status--active' },
  thinking:    { label: 'Processing',         className: 'status--active' },
  calling:     { label: 'On Voice Call',       className: 'status--calling' },
  writing:     { label: 'Updating Systems',    className: 'status--active' },
  alerting:    { label: 'Action Required',     className: 'status--alert' },
  celebrating: { label: 'Task Complete!',      className: 'status--success' },
  error:       { label: 'Error',               className: 'status--error' },
  offline:     { label: 'Offline',             className: 'status--offline' },
};

export default function AgentPanel({ agentId, onClose }: AgentPanelProps) {
  const agent = useWorldStore(selectAgent(agentId));
  const analytics = useWorldStore(selectAnalytics);
  const profile = AGENT_PROFILES[agentId];
  const statusConfig = STATUS_CONFIG[agent.status];

  const timeSinceActivity = getTimeSince(agent.lastActivity);

  // Real, backend-derived reliability: successful / scheduled executions.
  // Show "—" until the agent has actually been scheduled at least once,
  // rather than a hardcoded 100%.
  const roi = analytics.agentROI.find(r => r.agentId === agentId);
  const uptimeDisplay = roi && roi.scheduled > 0 ? `${roi.uptime}%` : '—';

  return (
    <div className="agent-panel glass-panel-elevated animate-slide-in-right">
      {/* Header */}
      <div className="agent-panel__header">
        <div className="agent-panel__identity">
          <span className="agent-panel__icon">{profile.icon}</span>
          <div>
            <h3 className="agent-panel__name">{profile.name}</h3>
            <span className="agent-panel__role text-caption">{profile.role}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      {/* Status */}
      <div className={`agent-panel__status ${statusConfig.className}`}>
        <div className={`status-dot status-dot--${agent.status === 'idle' ? 'idle' : agent.status === 'error' ? 'error' : agent.status === 'offline' ? 'offline' : 'active'}`} />
        <span>{statusConfig.label}</span>
      </div>

      {/* Description */}
      <p className="agent-panel__description text-body">{profile.description}</p>

      {/* Current Task */}
      {agent.currentTask && (
        <div className="agent-panel__section">
          <h4 className="text-label">Current Task</h4>
          <div className="agent-panel__task glass-panel">
            <div className="agent-panel__task-type">{agent.currentTask.type.replace(/_/g, ' ')}</div>
            <div className="agent-panel__task-desc text-caption">{agent.currentTask.description}</div>
            <div className="agent-panel__task-meta text-mono">
              Started {getTimeSince(agent.currentTask.startedAt)}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="agent-panel__section">
        <h4 className="text-label">Performance</h4>
        <div className="agent-panel__stats">
          <div className="agent-panel__stat">
            <span className="agent-panel__stat-value text-mono">{agent.tasksCompleted}</span>
            <span className="agent-panel__stat-label text-caption">Tasks Done</span>
          </div>
          <div className="agent-panel__stat">
            <span className="agent-panel__stat-value text-mono">{uptimeDisplay}</span>
            <span className="agent-panel__stat-label text-caption">Uptime</span>
          </div>
          <div className="agent-panel__stat">
            <span className="agent-panel__stat-value text-mono">{timeSinceActivity}</span>
            <span className="agent-panel__stat-label text-caption">Last Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────────────
function getTimeSince(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
