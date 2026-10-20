import { AsapDashboard } from '../analytics/AsapDashboard';
import { useLiveWorldFeed } from '../hooks/useLiveWorldFeed';
import { useExecutionData } from '../hooks/useExecutionData';
import { CommandHeader } from '../home/CommandHeader';

export default function Home() {
  useLiveWorldFeed();
  // One snapshot keeps the decision headline, review action, and queue consistent.
  const execution = useExecutionData();
  return (
    <div className="home-surface">
      <div className="max-w-6xl mx-auto px-5 md:px-8 pt-6">
        <CommandHeader execution={execution} />
      </div>
      <AsapDashboard execution={execution} />
    </div>
  );
}
