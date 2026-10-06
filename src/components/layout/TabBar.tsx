import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { House, User, Bell, Brain, Users, MapTrifold, CalendarBlank, ChatCircle } from '@phosphor-icons/react';

/* Order follows the working day: what ASAP did (Home), how you talk to it
 * (Chat), who it did it for (Clients), what it found (Scout), when you are
 * doing it (Calendar), then the settings and log tabs. The sliding indicator
 * measures from refs, so adding tabs needs no layout change.
 *
 * Chat sits second deliberately: it is the way you ASK for anything, so it
 * belongs beside the summary rather than buried after the record-keeping tabs. */
const TABS = [
  { path: '/', label: 'Home', icon: House },
  { path: '/chat', label: 'Chat', icon: ChatCircle },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/map', label: 'Scout', icon: MapTrifold },
  { path: '/calendar', label: 'Calendar', icon: CalendarBlank },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/memory', label: 'Memory', icon: Brain },
];

export function TabBar() {
  const location = useLocation();
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [ind, setInd] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const activePath =
    TABS.find((t) => (t.path === '/' ? location.pathname === '/' : location.pathname.startsWith(t.path)))?.path ?? '/';
  const currentPath = focusPath || activePath;

  useEffect(() => {
    const recalc = () => {
      const node = tabRefs.current[currentPath];
      if (node) setInd({ left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight });
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [currentPath]);

  return (
    <nav
      aria-label="Primary"
      className="relative h-11 bg-bg-elevated border-b border-border flex items-center px-3 shrink-0 overflow-x-auto gap-1.5"
      onMouseLeave={() => setFocusPath(null)}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 bg-bg-surface border border-border shadow-sm rounded-lg"
        style={{
          width: ind.width > 0 ? `${ind.width}px` : '0px',
          height: ind.height > 0 ? `${ind.height}px` : '0px',
          transform: `translate(${ind.left}px, ${ind.top}px)`,
          opacity: ind.width > 0 ? 1 : 0,
          pointerEvents: 'none',
          transition:
            'transform var(--dur-mid) var(--spring), width var(--dur-mid) var(--spring), height var(--dur-mid) var(--spring), opacity var(--dur-fast) var(--smooth)',
        }}
      />
      {TABS.map((tab) => {
        const isActive = tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path);
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            ref={(node) => { tabRefs.current[tab.path] = node; }}
            onMouseEnter={() => setFocusPath(tab.path)}
            onFocus={() => setFocusPath(tab.path)}
            onBlur={() => setFocusPath(null)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative z-10 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
              // Active tab = true black (light) / white (night). Uses text-primary,
              // NOT text-accent, so the nav never picks up any brand/orange accent
              // and stays black regardless of the accent token. (User: tabs must be black.)
              isActive ? 'text-text-primary font-semibold' : 'text-text-secondary hover:text-text-primary'
            }`}
            style={{ transition: 'color var(--dur-fast) var(--smooth)' }}
          >
            <tab.icon size={14} weight={isActive ? 'fill' : 'regular'} />
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
