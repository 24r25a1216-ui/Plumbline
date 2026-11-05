import type { Status } from './types';

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return dateShort(iso);
}

export function dateShort(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function hours(h: number | null | undefined) {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

export function dueIn(iso: string | null | undefined): { text: string; overdue: boolean } {
  if (!iso) return { text: '—', overdue: false };
  const ms = Date.parse(iso) - Date.now();
  const h = Math.abs(ms) / 3_600_000;
  const t = h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  return ms < 0 ? { text: `${t} overdue`, overdue: true } : { text: `due in ${t}`, overdue: false };
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const pct = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`);

export const STATUS_TONE: Record<Status, string> = {
  submitted: 'var(--ink-3)',
  analyzing: 'var(--lichen)',
  awaiting_verification: 'var(--ochre)',
  assigned: 'var(--sand)',
  in_progress: 'var(--lichen)',
  on_hold: 'var(--clay)',
  resolved: 'var(--verdigris)',
  closed: 'var(--moss)',
  reopened: 'var(--oxide)',
  withdrawn: 'var(--ink-4)',
  rejected: 'var(--ink-4)',
  merged: 'var(--ink-4)',
};

export const STATUS_LABEL: Record<Status, string> = {
  submitted: 'Submitted', analyzing: 'Analysing', awaiting_verification: 'Under verification', assigned: 'Assigned',
  in_progress: 'In progress', on_hold: 'On hold', resolved: 'Resolved', closed: 'Closed', reopened: 'Reopened',
  withdrawn: 'Withdrawn', rejected: 'Not accepted', merged: 'Merged',
};

export const SEV_LABEL = ['', 'Minimal', 'Low', 'Moderate', 'High', 'Critical'];
export const LANG_NATIVE: Record<string, string> = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' };
export const LANG_LABEL: Record<string, string> = { en: 'English', hi: 'Hindi', te: 'Telugu' };

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function detectScript(text: string): 'te' | 'hi' | 'en' | null {
  let te = 0, hi = 0, la = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0c00 && c <= 0x0c7f) te++;
    else if (c >= 0x0900 && c <= 0x097f) hi++;
    else if (/[a-z]/i.test(ch)) la++;
  }
  const total = te + hi + la;
  if (total < 6) return null;
  if (te / total > 0.3) return 'te';
  if (hi / total > 0.3) return 'hi';
  return 'en';
}

export const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
