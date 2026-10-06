import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * RORA / Remi theme switching — two themes only.
 *
 * | Label in UI | Internal key | CSS class on <html> |
 * |-------------|--------------|---------------------|
 * | Default     | 'default'    | (none — base :root) |
 * | Night Mode  | 'night'      | theme-night         |
 */
export type Theme = 'default' | 'night';

const THEME_CLASSES = ['theme-night'] as const;

/** Coerce any stored value (incl. retired 'colorblind'/'system') to a valid theme. */
function coerce(value: string | null | undefined): Theme {
  return value === 'night' ? 'night' : 'default';
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
    const saved = localStorage.getItem('rora-theme-storage');
    if (saved) {
      try {
        return coerce((JSON.parse(saved) as { state: { theme: string } }).state.theme);
      } catch {
        /* ignore */
      }
    }
    return coerce(localStorage.getItem('asap-theme'));
    } catch { return 'default'; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('rora-theme-storage', JSON.stringify({ state: { theme } }));
      localStorage.setItem('asap-theme', theme); // legacy compat
    } catch { /* Keep theme switching available when storage is blocked. */ }

    // Remove all known theme classes, then add only the active one (default = none).
    document.documentElement.classList.remove(...THEME_CLASSES);
    if (theme !== 'default') {
      document.documentElement.classList.add(`theme-${theme}`);
    }
    // data-theme attribute drives the ambient-light + glow selectors.
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
