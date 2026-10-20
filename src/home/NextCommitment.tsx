import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCalendar } from '../calendar/useCalendar';
import { nextCommitment } from './selectNextCommitment';

export default function NextCommitment({ now }: { now: number }) {
  // Keep the query window stable while the status clock advances.
  const day = new Date(now).toDateString();
  const range = useMemo(() => {
    const from = new Date(day);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [day]);
  const calendar = useCalendar(range);
  const next = nextCommitment(calendar.occurrences, now);
  const sameDay = next?.start.toDateString() === new Date(now).toDateString();
  const label = calendar.loading ? 'Loading your calendar…'
    : calendar.error ? 'Calendar unavailable — open Calendar to retry'
      : next ? `${next.start.toLocaleString('en-CA', {
        ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
        hour: 'numeric', minute: '2-digit',
      })} — ${next.event.title}`
        : 'No upcoming timed commitments in the next 7 days';

  return (
    <Link to="/calendar" className="home-control mt-5 inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-text-primary">
      <span className="text-text-tertiary">Next</span>
      <span>·</span>
      <span>{label}</span>
    </Link>
  );
}
