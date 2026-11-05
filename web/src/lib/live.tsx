/**
 * Real-time layer: one EventSource per session. Invalidates cached queries
 * when complaints change and exposes live analysis-stage progress (FR21).
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';
import { useToast } from '../components/Toast';
import type { Notification } from './types';

export interface StageEvent {
  complaintId: number;
  stage: string;
  label: string;
  fr: string;
  state: 'running' | 'done' | 'fallback' | 'failed' | 'skipped';
  engine?: string;
  ms?: number;
  summary?: string;
}

interface LiveCtx {
  connected: boolean;
  stages: Record<number, StageEvent[]>;
}
const Ctx = createContext<LiveCtx>({ connected: false, stages: {} });

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const [stages, setStages] = useState<Record<number, StageEvent[]>>({});
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/stream');
    let debounce: number | undefined;
    const invalidateLists = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['complaints'] });
        qc.invalidateQueries({ queryKey: ['overview'] });
        qc.invalidateQueries({ queryKey: ['counts'] });
      }, 250);
    };

    es.addEventListener('hello', () => setConnected(true));
    es.onerror = () => setConnected(false);
    es.addEventListener('complaint.updated', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      qc.invalidateQueries({ queryKey: ['complaint', d.complaintId] });
      invalidateLists();
    });
    es.addEventListener('analysis.stage', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as StageEvent;
      setStages((prev) => {
        const list = (prev[d.complaintId] ?? []).filter((s) => s.stage !== d.stage);
        return { ...prev, [d.complaintId]: [...list, d] };
      });
    });
    es.addEventListener('analysis.done', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      qc.invalidateQueries({ queryKey: ['complaint', d.complaintId] });
      invalidateLists();
      window.setTimeout(() => setStages((prev) => {
        const next = { ...prev };
        delete next[d.complaintId];
        return next;
      }), 1500);
    });
    es.addEventListener('notification', (e) => {
      const n = JSON.parse((e as MessageEvent).data) as Notification;
      qc.invalidateQueries({ queryKey: ['notifications'] });
      const tone = n.kind === 'urgent' || n.kind === 'escalation' ? 'danger' : n.kind === 'success' ? 'success' : n.kind === 'warning' ? 'warn' : 'info';
      toastRef.current.push({ title: n.title, body: n.body, tone, href: n.complaint_id ? `${caseBase(user.role)}${n.complaint_id}` : undefined });
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        try {
          const notice = new Notification(n.title, { body: n.body, tag: `plumbline-${n.id}`, icon: '/plumb.svg' });
          notice.onclick = () => { window.focus(); if (n.complaint_id) window.location.href = `${caseBase(user.role)}${n.complaint_id}`; notice.close(); };
        } catch { /* Native notifications may be unavailable in some embedded browsers. */ }
      }
    });
    return () => {
      es.close();
      setConnected(false);
      window.clearTimeout(debounce);
    };
  }, [user?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ connected, stages }}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);

export const caseBase = (role: string) => (role === 'admin' ? '/admin/c/' : role === 'officer' ? '/desk/c/' : '/app/c/');
