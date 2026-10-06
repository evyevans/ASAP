/* ================================================================
   ASAP — App shell (Remi design language)
   A clean single-page analytics surface: glass header + one
   scrolling narrative dashboard. Theme + sign-out live in the header.
   ================================================================ */

import { Outlet } from 'react-router-dom';
import { Sun, Moon, RotateCcw } from 'lucide-react';
import { TabBar } from './components/layout/TabBar';
import { useTheme } from './contexts/ThemeContext';
import { useAuth } from './auth/AuthContext';
import { DemoBar } from './demo/DemoBar';

export default function App() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const isNight = theme === 'night';

  const iconBtn =
    'w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary ' +
    'hover:text-text-primary hover:bg-bg-surface transition-colors';

  return (
    <div className="flex flex-col h-screen bg-bg-primary">

      <header className="h-14 shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-border bg-bg-elevated backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl font-black tracking-widest text-text-primary select-none">ASAP</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border border-border rounded-full px-2 py-0.5">
            v2
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setTheme(isNight ? 'default' : 'night')} className={iconBtn}
            aria-label="Toggle theme" title={isNight ? 'Switch to Default' : 'Switch to Night'}>
            {isNight ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => signOut()} className={iconBtn} aria-label="Reset demo" title="Reset the sample workspace">
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <DemoBar />
      <TabBar />

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
