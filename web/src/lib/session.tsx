import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { User, Role } from './types';

/* ── Session ─────────────────────────────────────────────────────── */

interface SessionCtx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}
const Ctx = createContext<SessionCtx>(null!);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User | null }>('/auth/session')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const setUser = useCallback((u: User | null) => qc.setQueryData(['me'], u), [qc]);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    // Order matters: flip the observed 'me' query first so every guard sees "signed out",
    // then drop the previous user's cached data (never qc.clear(), which orphans the 'me' observer).
    await qc.cancelQueries();
    qc.setQueryData(['me'], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }, [qc]);

  useEffect(() => {
    const onUnauth = () => qc.setQueryData(['me'], null);
    window.addEventListener('plb:unauthorized', onUnauth);
    return () => window.removeEventListener('plb:unauthorized', onUnauth);
  }, [qc]);

  return <Ctx.Provider value={{ user: me.data ?? null, loading: me.isLoading, setUser, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : role === 'officer' ? '/desk' : '/app');

/* ── Theme ───────────────────────────────────────────────────────── */

type Theme = 'dark' | 'light';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>(null!);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151516' : '#f6f7f8');
    try {
      localStorage.setItem('plb-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  const toggle = useCallback(() => {
    const flip = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(flip);
    else flip();
  }, []);
  return <ThemeCtx.Provider value={{ theme, toggle, set: setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
