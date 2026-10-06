import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../config/api';
import './TeamDashboard.css';

interface AgentData {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  status?: string;
}

interface TeamMetrics {
  active_agents: number;
  compliance_rate: number;
  tasks_monitored: number;
}

interface DashboardData {
  org_id: string;
  agents: AgentData[];
  team_metrics: TeamMetrics;
  pipeline_summary: Record<string, unknown>;
}

export default function TeamDashboard() {
  const { session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      if (!session?.access_token) {
        setError('Sign in to view team data.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(apiUrl('/api/admin/team-overview'), {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to fetch team data');
        }
        const result: DashboardData = await response.json();
        setData(result);
        setError(null);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : 'Failed to load team data');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [session?.access_token]);

  if (loading) return <div className="admin-loading">Loading Team Metrics...</div>;
  if (error) return <div className="admin-error">{error}</div>;
  if (!data) return null;

  return (
    <div className="team-dashboard-container">
      <div className="team-header glass-panel">
        <h2 className="text-heading">Team Operating System</h2>
        <p className="text-body mt-1">Aggregate pipeline velocity and coaching adherence.</p>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass-panel">
          <span className="text-label">Active Agents</span>
          <span className="metric-value">{data.team_metrics.active_agents}</span>
        </div>
        <div className="metric-card glass-panel">
          <span className="text-label">Compliance Rate</span>
          <span className="metric-value">
            {data.team_metrics.tasks_monitored > 0
              ? `${data.team_metrics.compliance_rate}%`
              : '—'}
          </span>
        </div>
        <div className="metric-card glass-panel">
          <span className="text-label">Tasks Monitored</span>
          <span className="metric-value">{data.team_metrics.tasks_monitored}</span>
        </div>
      </div>

      <div className="agents-list glass-panel">
        <h3 className="text-subheading" style={{ marginBottom: '16px' }}>Agent Roster</h3>
        {data.agents.length === 0 ? (
          <p className="text-body mt-2">
            No team members found for this organization. Add users to{' '}
            <code>user_profiles</code> in Supabase linked to your org.
          </p>
        ) : (
          <table className="roster-table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map(agent => (
                <tr key={agent.id}>
                  <td>
                    <span className="text-body">
                      {agent.first_name} {agent.last_name || ''}
                    </span>
                  </td>
                  <td><span className="text-caption">{agent.role}</span></td>
                  <td>
                    <span className={`status-badge status-${agent.status || 'active'}`}>
                      {(agent.status || 'active').replace(/^./, c => c.toUpperCase())}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
