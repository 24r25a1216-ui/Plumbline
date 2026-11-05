import { Router } from 'express';
import { all, get } from '../db.js';
import { DOMAINS } from '../ai/taxonomy.js';
import { taxonomyPayload } from './complaints.js';
import { aiActive, getSettings } from '../settings.js';
import { requireAuth } from '../auth.js';
import { subscribe, liveCount } from '../events.js';
import { h, idParam } from '../validate.js';
import { run, nowIso } from '../db.js';

export const metaRouter = Router();

metaRouter.get('/taxonomy', (_req, res) => {
  const departments = all('SELECT id, code, name, domain, description, sla_hours AS slaHours, active FROM departments ORDER BY domain, name');
  res.json({ domains: DOMAINS, ...taxonomyPayload(), departments });
});

metaRouter.get('/stats', (_req, res) => {
  const total = get<{ n: number }>('SELECT COUNT(*) AS n FROM complaints')!.n;
  const resolved = get<{ n: number }>("SELECT COUNT(*) AS n FROM complaints WHERE status IN ('resolved','closed')")!.n;
  const durations = all<{ h: number }>(
    "SELECT (julianday(resolved_at) - julianday(created_at)) * 24 AS h FROM complaints WHERE resolved_at IS NOT NULL ORDER BY h",
  ).map((r) => r.h);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  const rating = get<{ avg: number | null; n: number }>('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM feedback')!;
  const depts = get<{ n: number }>('SELECT COUNT(*) AS n FROM departments WHERE active = 1')!.n;
  res.json({
    total, resolved, medianResolutionHours: median ? Math.round(median * 10) / 10 : null,
    satisfaction: rating.avg ? Math.round(rating.avg * 10) / 10 : null, ratings: rating.n, departments: depts,
    languages: 3, engine: aiActive() ? 'openai' : 'local', model: aiActive() ? getSettings().openai_model : 'plumbline-nb',
  });
});

/* ── Live stream + notifications ────────────────────────────── */

export const liveRouter = Router();
liveRouter.use(requireAuth);

liveRouter.get('/stream', (req, res) => subscribe(res, req.user!));
liveRouter.get('/presence', (_req, res) => res.json({ live: liveCount() }));

liveRouter.get('/notifications', (req, res) => {
  const items = all('SELECT n.*, c.ref FROM notifications n LEFT JOIN complaints c ON c.id = n.complaint_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 60', req.user!.id);
  const unread = get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user!.id)!.n;
  res.json({ items, unread });
});

liveRouter.post('/notifications/read-all', (req, res) => {
  run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowIso(), req.user!.id);
  res.json({ ok: true });
});

liveRouter.post('/notifications/:id/read', h((req, res) => {
  run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', nowIso(), idParam(req), req.user!.id);
  res.json({ ok: true });
}));
