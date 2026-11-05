import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

type Tone = 'info' | 'success' | 'warn' | 'danger';
interface ToastInput {
  title: string;
  body?: string;
  tone?: Tone;
  href?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}
interface ToastItem extends ToastInput {
  id: number;
  leaving?: boolean;
}

const TONE: Record<Tone, string> = { info: 'var(--lichen)', success: 'var(--verdigris)', warn: 'var(--ochre)', danger: 'var(--oxide)' };
const Ctx = createContext<{ push: (t: ToastInput) => void; error: (e: unknown, fallback?: string) => void }>(null!);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const navigate = useNavigate();

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 200);
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      // Toasts with an action stay longer so the action is actually reachable.
      window.setTimeout(() => dismiss(id), t.duration ?? (t.action ? 9000 : 5200));
    },
    [dismiss],
  );
  const error = useCallback((e: unknown, fallback = 'Something went wrong') => push({ title: (e as Error)?.message || fallback, tone: 'danger' }), [push]);

  return (
    <Ctx.Provider value={{ push, error }}>
      {children}
      <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.leaving ? ' leaving' : ''}`} style={{ ['--c' as string]: TONE[t.tone ?? 'info'] }}>
            <span className="bar" />
            <div
              className="col gap-4"
              style={{ cursor: t.href ? 'pointer' : undefined, minWidth: 0 }}
              onClick={() => {
                if (t.href) {
                  navigate(t.href);
                  dismiss(t.id);
                }
              }}
            >
              <strong style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</strong>
              {t.body && <span className="small muted clamp-2">{t.body}</span>}
              {t.action && (
                <button
                  className="btn btn-sm btn-outline"
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  <Icon name="undo" /> {t.action.label}
                </button>
              )}
            </div>
            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
