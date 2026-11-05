import { all, run } from './db.js';
import { config } from './config.js';

export interface Settings {
  openai_api_key: string;
  openai_model: string;
  openai_embed_model: string;
  ai_enabled: boolean;
  sla_p1_hours: number;
  sla_p2_hours: number;
  sla_p3_hours: number;
  sla_p4_hours: number;
  verify_sla_hours: number;
  auto_escalate_p1: boolean;
  duplicate_threshold: number;
  similar_threshold: number;
  reopen_window_days: number;
}

const DEFAULTS: Settings = {
  openai_api_key: '',
  openai_model: config.openai.model,
  openai_embed_model: config.openai.embedModel,
  ai_enabled: true,
  sla_p1_hours: 24,
  sla_p2_hours: 72,
  sla_p3_hours: 168,
  sla_p4_hours: 336,
  verify_sla_hours: 12,
  auto_escalate_p1: true,
  duplicate_threshold: 0.82,
  similar_threshold: 0.35,
  reopen_window_days: 14,
};

let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: any = { ...DEFAULTS };
  for (const r of rows) {
    if (!(r.key in DEFAULTS)) continue;
    const def = (DEFAULTS as any)[r.key];
    s[r.key] = typeof def === 'number' ? Number(r.value) : typeof def === 'boolean' ? r.value === 'true' : r.value;
  }
  cached = s as Settings;
  return cached;
}

export function updateSettings(patch: Partial<Settings>) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS) || v === undefined) continue;
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v));
  }
  cached = null;
  return getSettings();
}

/** Key from DB wins over .env so admins can paste it from the UI. */
export function openaiKey(): string {
  return getSettings().openai_api_key || config.openai.apiKey;
}

export function aiActive(): boolean {
  return getSettings().ai_enabled && !!openaiKey();
}

export function slaHoursFor(priority: string): number {
  const s = getSettings();
  return ({ P1: s.sla_p1_hours, P2: s.sla_p2_hours, P3: s.sla_p3_hours, P4: s.sla_p4_hours } as Record<string, number>)[priority] ?? s.sla_p3_hours;
}

export function publicSettings() {
  const s = getSettings();
  const key = openaiKey();
  return {
    ...s,
    openai_api_key: '',
    openai_key_set: !!key,
    openai_key_source: s.openai_api_key ? 'database' : config.openai.apiKey ? 'environment' : 'none',
    openai_key_hint: key ? `${key.slice(0, 3)}…${key.slice(-4)}` : '',
  };
}
