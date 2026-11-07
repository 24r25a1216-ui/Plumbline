import { Router } from 'express';
import crypto from 'node:crypto';
import { all, get, run, json, audit, nowIso } from '../db.js';
import { requireAuth, requireRole, hashPassword, type AuthUser } from '../auth.js';
import { parse, h, z, idParam } from '../validate.js';
import { HttpError, OPEN_STATUSES, ACTIVE_WORK } from '../services.js';
import { categoryLabel, CATEGORIES, DOMAINS } from '../ai/taxonomy.js';
import { modelInfo, trainLocalModel } from '../ai/classifier.js';
import { publicSettings, updateSettings, aiActive } from '../settings.js';
import { testConnection } from '../ai/openai.js';
import { liveCount } from '../events.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const inList = (xs: readonly string[]) => xs.map((s) => `'${s}'`).join(',');

/* ── Overview (admin, and a scoped version for officers) ─────── */

adminRouter.get('/overview', requireRole('admin', 'officer'), (req, res) => {
  const u = req.user!;
  const scope = u.role === 'officer' ? `AND department_id = ${Number(u.department_id) || -1} AND verified_at IS NOT NULL` : '';
  const n = (where: string, ...p: any[]) => get<{ n: number }>(`SELECT COUNT(*) AS n FROM complaints WHERE 1=1 ${scope} AND ${where}`, ...p)!.n;
  const now = nowIso();

  const kpis = {
    total: n('1=1'),
    open: n(`status IN (${inList(OPEN_STATUSES)})`),
    awaiting: n("status = 'awaiting_verification'"),
    analyzing: n("status IN ('submitted','analyzing')"),
    inProgress: n(`status IN (${inList(ACTIVE_WORK)})`),
    resolved: n("status IN ('resolved','closed')"),
    escalated: n(`escalation_level > 1 AND status IN (${inList(OPEN_STATUSES)})`),
    overdue: n(`sla_due_at < ? AND status IN (${inList(ACTIVE_WORK)})`, now),
    p1Open: n(`priority = 'P1' AND status IN (${inList(OPEN_STATUSES)})`),
    last7: n("created_at >= datetime('now','-7 days')"),
    prev7: n("created_at >= datetime('now','-14 days') AND created_at < datetime('now','-7 days')"),
  };

  const durations = all<{ h: number }>(`SELECT (julianday(resolved_at) - julianday(created_at)) * 24 AS h FROM complaints WHERE resolved_at IS NOT NULL ${scope} ORDER BY h`).map((r) => r.h);
  const medianResolutionHours = durations.length ? Math.round(durations[Math.floor(durations.length / 2)] * 10) / 10 : null;
  const sla = get<{ ok: number; n: number }>(`SELECT SUM(CASE WHEN resolved_at <= sla_due_at THEN 1 ELSE 0 END) AS ok, COUNT(*) AS n FROM complaints WHERE resolved_at IS NOT NULL AND sla_due_at IS NOT NULL ${scope}`)!;
  const verified = get<{ n: number }>(`SELECT COUNT(*) AS n FROM complaints WHERE verified_at IS NOT NULL AND ai_json IS NOT NULL ${scope}`)!.n;
  const corrected = get<{ n: number }>(`SELECT COUNT(DISTINCT k.complaint_id) AS n FROM corrections k JOIN complaints c ON c.id = k.complaint_id WHERE k.field = 'category' AND k.source = 'verification' ${scope.replace(/department_id/g, 'c.department_id').replace(/verified_at/g, 'c.verified_at')}`)!.n;
  const rating = get<{ avg: number | null; n: number }>(`SELECT AVG(f.rating) AS avg, COUNT(*) AS n FROM feedback f JOIN complaints c ON c.id = f.complaint_id WHERE 1=1 ${scope.replace(/department_id/g, 'c.department_id').replace(/verified_at/g, 'c.verified_at')}`)!;

  // 30-day intake vs resolution series
  const series: { date: string; intake: number; resolved: number }[] = [];
  const intakeRows = all<{ d: string; n: number }>(`SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM complaints WHERE created_at >= datetime('now','-30 days') ${scope} GROUP BY d`);
  const resolvedRows = all<{ d: string; n: number }>(`SELECT substr(resolved_at,1,10) AS d, COUNT(*) AS n FROM complaints WHERE resolved_at >= datetime('now','-30 days') ${scope} GROUP BY d`);
  const im = new Map(intakeRows.map((r) => [r.d, r.n]));
  const rm = new Map(resolvedRows.map((r) => [r.d, r.n]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.push({ date: d, intake: im.get(d) ?? 0, resolved: rm.get(d) ?? 0 });
  }

  const byDomain = DOMAINS.map((d) => ({
    key: d.key, label: d.label,
    total: n('domain = ?', d.key),
    open: n(`domain = ? AND status IN (${inList(OPEN_STATUSES)})`, d.key),
  }));
  const byCategory = all<{ category: string; n: number; open: number }>(
    `SELECT category, COUNT(*) AS n, SUM(CASE WHEN status IN (${inList(OPEN_STATUSES)}) THEN 1 ELSE 0 END) AS open FROM complaints WHERE category IS NOT NULL ${scope} GROUP BY category ORDER BY n DESC LIMIT 10`,
  ).map((r) => ({ ...r, label: categoryLabel(r.category), domain: CATEGORIES.find((c) => c.key === r.category)?.domain }));
  const severity = [1, 2, 3, 4, 5].map((s) => ({ level: s, n: n('severity = ?', s) }));
  const priority = ['P1', 'P2', 'P3', 'P4'].map((p) => ({ priority: p, open: n(`priority = ? AND status IN (${inList(OPEN_STATUSES)})`, p), total: n('priority = ?', p) }));
  const districts = all<{ district: string; n: number; open: number; critical: number }>(
    `SELECT district, COUNT(*) AS n, SUM(CASE WHEN status IN (${inList(OPEN_STATUSES)}) THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN severity >= 4 THEN 1 ELSE 0 END) AS critical
       FROM complaints WHERE district IS NOT NULL ${scope} GROUP BY district ORDER BY n DESC LIMIT 16`,
  );
  const languages = all<{ language: string; n: number }>(`SELECT language, COUNT(*) AS n FROM complaints WHERE language IS NOT NULL ${scope} GROUP BY language`);
  const departments = u.role === 'admin'
    ? all<any>(
        `SELECT d.id, d.code, d.name, d.domain, d.sla_hours AS slaHours,
                SUM(CASE WHEN c.status IN (${inList(ACTIVE_WORK)}) THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN c.status IN (${inList(ACTIVE_WORK)}) AND c.sla_due_at < ? THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
                AVG(CASE WHEN c.resolved_at IS NOT NULL THEN (julianday(c.resolved_at) - julianday(c.created_at)) * 24 END) AS avgHours,
                (SELECT AVG(f.rating) FROM feedback f JOIN complaints c2 ON c2.id = f.complaint_id WHERE c2.department_id = d.id) AS rating
           FROM departments d LEFT JOIN complaints c ON c.department_id = d.id AND c.verified_at IS NOT NULL
          GROUP BY d.id ORDER BY open DESC, d.code`,
        now,
      )
    : [];

  const activity = all<any>(
    `SELECT e.id, e.type, e.message, e.to_status AS toStatus, e.created_at AS createdAt, c.id AS complaintId, c.ref, a.name AS actor
       FROM complaint_events e JOIN complaints c ON c.id = e.complaint_id LEFT JOIN users a ON a.id = e.actor_id
      WHERE 1=1 ${scope.replace(/department_id/g, 'c.department_id').replace(/verified_at/g, 'c.verified_at')}
      ORDER BY e.id DESC LIMIT 14`,
  );

  res.json({
    kpis: { ...kpis, medianResolutionHours, slaCompliance: sla.n ? Math.round((sla.ok / sla.n) * 1000) / 10 : null, aiAccuracy: verified ? Math.round((1 - corrected / verified) * 1000) / 10 : null, verified, satisfaction: rating.avg ? Math.round(rating.avg * 100) / 100 : null, ratings: rating.n },
    series, byDomain, byCategory, severity, priority, districts, languages, departments, activity,
    engine: { mode: aiActive() ? 'openai' : 'local', live: liveCount() },
  });
});

/* ── AI insights & continuous improvement (FR24, FR25) ──────── */

adminRouter.get('/insights', requireRole('admin'), (_req, res) => {
  const verifiedRows = all<{ id: number; ai_json: string; category: string; domain: string; severity: number; priority: string; confidence: number | null }>(
    'SELECT id, ai_json, category, domain, severity, priority, confidence FROM complaints WHERE verified_at IS NOT NULL AND ai_json IS NOT NULL',
  );
  const fields = ['domain', 'category', 'severity', 'priority', 'department', 'district'] as const;
  const fieldStats = fields.map((f) => {
    const corrected = get<{ n: number }>("SELECT COUNT(DISTINCT complaint_id) AS n FROM corrections WHERE field = ? AND source IN ('verification','reassignment','officer_return')", f)!.n;
    return { field: f, corrected, total: verifiedRows.length, accuracy: verifiedRows.length ? Math.round((1 - corrected / verifiedRows.length) * 1000) / 10 : null };
  });

  // Calibration: does stated confidence match observed accuracy?
  const correctedCat = new Set(all<{ complaint_id: number }>("SELECT DISTINCT complaint_id FROM corrections WHERE field = 'category'").map((r) => r.complaint_id));
  const buckets = [
    { label: '< 50%', lo: 0, hi: 0.5 },
    { label: '50–75%', lo: 0.5, hi: 0.75 },
    { label: '75–90%', lo: 0.75, hi: 0.9 },
    { label: '≥ 90%', lo: 0.9, hi: 1.01 },
  ].map((b) => {
    const rows = verifiedRows.filter((r) => (r.confidence ?? 0) >= b.lo && (r.confidence ?? 0) < b.hi);
    const ok = rows.filter((r) => !correctedCat.has(r.id)).length;
    return { label: b.label, n: rows.length, accuracy: rows.length ? Math.round((ok / rows.length) * 1000) / 10 : null };
  });

  const confusion = all<{ ai_value: string; final_value: string; n: number }>(
    "SELECT ai_value, final_value, COUNT(*) AS n FROM corrections WHERE field = 'category' GROUP BY ai_value, final_value ORDER BY n DESC LIMIT 8",
  ).map((r) => ({ from: categoryLabel(r.ai_value), to: categoryLabel(r.final_value), n: r.n }));

  const corrections = all<any>(
    `SELECT k.id, k.field, k.ai_value AS aiValue, k.final_value AS finalValue, k.note, k.source, k.created_at AS createdAt, a.name AS actor, c.ref, c.id AS complaintId
       FROM corrections k JOIN complaints c ON c.id = k.complaint_id LEFT JOIN users a ON a.id = k.actor_id ORDER BY k.id DESC LIMIT 60`,
  ).map((k) => ({ ...k, aiLabel: k.field === 'category' ? categoryLabel(k.aiValue) : k.aiValue, finalLabel: k.field === 'category' ? categoryLabel(k.finalValue) : k.finalValue }));

  const ratingHist = [1, 2, 3, 4, 5].map((r) => ({ rating: r, n: get<{ n: number }>('SELECT COUNT(*) AS n FROM feedback WHERE rating = ?', r)!.n }));
  const fb = get<{ avg: number | null; n: number; sat: number }>('SELECT AVG(rating) AS avg, COUNT(*) AS n, SUM(satisfied) AS sat FROM feedback')!;
  const comments = all<any>(
    `SELECT f.rating, f.satisfied, f.comment, f.created_at AS createdAt, c.ref, c.id AS complaintId, d.code AS dept
       FROM feedback f JOIN complaints c ON c.id = f.complaint_id LEFT JOIN departments d ON d.id = c.department_id
      WHERE f.comment != '' ORDER BY f.rating ASC, f.id DESC LIMIT 12`,
  );
  const engines = all<{ ai_engine: string; n: number }>('SELECT ai_engine, COUNT(*) AS n FROM complaints WHERE ai_engine IS NOT NULL GROUP BY ai_engine');
  const versions = all('SELECT v.*, a.name AS actor FROM model_versions v LEFT JOIN users a ON a.id = v.actor_id ORDER BY v.id DESC LIMIT 12');

  const stageTimes: Record<string, { total: number; n: number; fallback: number }> = {};
  for (const r of verifiedRows.slice(-200)) {
    for (const t of json<{ trace: { key: string; ms: number; status: string }[] }>(r.ai_json, { trace: [] }).trace ?? []) {
      const s = (stageTimes[t.key] ??= { total: 0, n: 0, fallback: 0 });
      s.total += t.ms; s.n++; if (t.status === 'fallback') s.fallback++;
    }
  }

  res.json({
    model: modelInfo(), versions, fieldStats, calibration: buckets, confusion, corrections,
    feedback: { histogram: ratingHist, average: fb.avg ? Math.round(fb.avg * 100) / 100 : null, count: fb.n, satisfiedPct: fb.n ? Math.round((fb.sat / fb.n) * 1000) / 10 : null, comments },
    engines, stages: Object.entries(stageTimes).map(([key, s]) => ({ key, avgMs: Math.round(s.total / s.n), runs: s.n, fallback: s.fallback })),
    aiActive: aiActive(),
  });
});

adminRouter.post('/model/retrain', requireRole('admin'), (req, res) => {
  const r = trainLocalModel('manual', req.user!.id);
  audit(req.user!.id, 'model.retrain', '', r);
  res.json(r);
});

/* ── Users ──────────────────────────────────────────────────── */

adminRouter.get('/users', requireRole('admin'), (req, res) => {
  const role = String(req.query.role ?? '');
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const where: string[] = [];
  const p: any[] = [];
  if (['citizen', 'officer', 'admin'].includes(role)) { where.push('u.role = ?'); p.push(role); }
  if (q) { where.push('(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
  const rows = all(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.status, u.last_login_at AS lastLoginAt, u.created_at AS createdAt, d.id AS departmentId, d.code AS departmentCode,
            (SELECT COUNT(*) FROM complaints c WHERE c.user_id = u.id) AS complaints
       FROM users u LEFT JOIN departments d ON d.id = u.department_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.role DESC, u.id DESC LIMIT 300`,
    ...p,
  );
  res.json({ items: rows });
});

const tempPassword = () => `Plb-${crypto.randomBytes(4).toString('hex')}-${Math.floor(Math.random() * 90 + 10)}`;

adminRouter.post('/users', requireRole('admin'), h(async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2, 'Enter a name.').max(80),
      email: z.string().trim().toLowerCase().email('Enter a valid email.'),
      role: z.enum(['officer', 'admin']),
      departmentId: z.number().int().positive().nullable().default(null),
    }).refine((b) => b.role !== 'officer' || b.departmentId, { message: 'Officers must belong to a department.', path: ['departmentId'] }),
    req.body,
  );
  if (get('SELECT 1 FROM users WHERE email = ?', body.email)) throw new HttpError(409, 'Email already in use.', { fields: { email: 'This email already has an account.' } });
  const pw = tempPassword();
  const { lastId } = run('INSERT INTO users (name, email, password_hash, role, department_id) VALUES (?,?,?,?,?)', body.name, body.email, await hashPassword(pw), body.role, body.role === 'officer' ? body.departmentId : null);
  audit(req.user!.id, 'user.create', `user:${lastId}`, { role: body.role });
  res.status(201).json({ id: lastId, temporaryPassword: pw });
}));

adminRouter.patch('/users/:id', requireRole('admin'), h((req, res) => {
  const id = idParam(req);
  const body = parse(
    z.object({ role: z.enum(['citizen', 'officer', 'admin']).optional(), departmentId: z.number().int().positive().nullable().optional(), status: z.enum(['active', 'suspended']).optional(), reason: z.string().trim().max(300).optional() }),
    req.body,
  );
  const target = get<AuthUser>('SELECT * FROM users WHERE id = ?', id);
  if (!target) throw new HttpError(404, 'User not found.');
  if (id === req.user!.id && (body.status === 'suspended' || (body.role && body.role !== 'admin'))) throw new HttpError(409, 'You cannot suspend or demote your own account.');
  if (target.role === 'admin' && (body.status === 'suspended' || (body.role && body.role !== 'admin'))) {
    const admins = get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")!.n;
    if (admins <= 1) throw new HttpError(409, 'At least one active administrator is required.');
  }
  const role = body.role ?? target.role;
  const dept = role === 'officer' ? (body.departmentId !== undefined ? body.departmentId : target.department_id) : null;
  if (role === 'officer' && !dept) throw new HttpError(422, 'Officers must belong to a department.', { fields: { departmentId: 'Choose a department.' } });
  const status = body.status ?? target.status;
  run('UPDATE users SET role = ?, department_id = ?, status = ?, token_version = token_version + ? WHERE id = ?', role, dept, status, status !== target.status || role !== target.role ? 1 : 0, id);
  audit(req.user!.id, 'user.update', `user:${id}`, { role, dept, status, reason: body.reason });
  res.json({ ok: true });
}));

adminRouter.post('/users/:id/reset-password', requireRole('admin'), h(async (req, res) => {
  const id = idParam(req);
  if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw new HttpError(404, 'User not found.');
  const pw = tempPassword();
  run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashPassword(pw), id);
  audit(req.user!.id, 'user.reset_password', `user:${id}`);
  res.json({ temporaryPassword: pw });
}));

/* ── Departments ────────────────────────────────────────────── */

adminRouter.get('/departments', requireRole('admin'), (_req, res) => {
  res.json({
    items: all(
      `SELECT d.*, d.sla_hours AS slaHours, d.head_name AS headName,
              (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'officer') AS officers,
              (SELECT COUNT(*) FROM complaints c WHERE c.department_id = d.id AND c.status IN (${inList(ACTIVE_WORK)})) AS open
         FROM departments d ORDER BY d.domain, d.name`,
    ),
  });
});

adminRouter.patch('/departments/:id', requireRole('admin'), h((req, res) => {
  const id = idParam(req);
  const body = parse(
    z.object({
      name: z.string().trim().min(3).max(120).optional(),
      description: z.string().trim().max(400).optional(),
      headName: z.string().trim().max(120).optional(),
      email: z.string().trim().email('Enter a valid email.').or(z.literal('')).optional(),
      slaHours: z.number().int().min(4, 'At least 4 hours.').max(2160).optional(),
      active: z.boolean().optional(),
    }),
    req.body,
  );
  const d = get<any>('SELECT * FROM departments WHERE id = ?', id);
  if (!d) throw new HttpError(404, 'Department not found.');
  if (body.active === false) {
    const open = get<{ n: number }>(`SELECT COUNT(*) AS n FROM complaints WHERE department_id = ? AND status IN (${inList(ACTIVE_WORK)})`, id)!.n;
    if (open) throw new HttpError(409, `This department still has ${open} open complaint(s). Reassign them first.`);
  }
  run('UPDATE departments SET name = ?, description = ?, head_name = ?, email = ?, sla_hours = ?, active = ? WHERE id = ?',
    body.name ?? d.name, body.description ?? d.description, body.headName ?? d.head_name, body.email ?? d.email, body.slaHours ?? d.sla_hours, body.active === undefined ? d.active : body.active ? 1 : 0, id);
  audit(req.user!.id, 'department.update', d.code, body);
  res.json({ ok: true });
}));


/* ── Public authority email directory ───────────────────────── */

adminRouter.get('/authorities', requireRole('admin'), (_req, res) => {
  res.json({ items: all(
    `SELECT a.*, a.department_id AS departmentId, a.authority_name AS authorityName,
            a.source_url AS sourceUrl, d.code AS departmentCode, d.name AS departmentName
       FROM department_authorities a JOIN departments d ON d.id = a.department_id
      ORDER BY d.name, a.district, a.level`,
  ) });
});

const authoritySchema = z.object({
  departmentId: z.number().int().positive(),
  district: z.string().trim().max(100).default(''),
  institution: z.string().trim().max(160).default(''),
  level: z.number().int().min(1).max(50),
  designation: z.string().trim().min(2).max(120),
  authorityName: z.string().trim().max(120).default(''),
  email: z.string().trim().email().max(254),
  sourceUrl: z.string().trim().url().max(500),
  verified: z.boolean().default(false),
  active: z.boolean().default(true),
});

adminRouter.post('/authorities', requireRole('admin'), h((req, res) => {
  const body = parse(authoritySchema, req.body);
  if (!get('SELECT 1 FROM departments WHERE id = ? AND active = 1', body.departmentId)) throw new HttpError(422, 'Choose an active department.');
  if (body.verified && !/^https:\/\//i.test(body.sourceUrl)) throw new HttpError(422, 'A public HTTPS source is required before verification.');
  try {
    const r = run('INSERT INTO department_authorities (department_id, district, institution, level, designation, authority_name, email, source_url, verified, active) VALUES (?,?,?,?,?,?,?,?,?,?)', body.departmentId, body.district, body.institution, body.level, body.designation, body.authorityName, body.email, body.sourceUrl, body.verified, body.active);
    audit(req.user!.id, 'authority.create', `authority:${r.lastId}`, { departmentId: body.departmentId, district: body.district, institution: body.institution, level: body.level, email: body.email, verified: body.verified });
    res.status(201).json({ id: r.lastId });
  } catch (error: any) {
    if (String(error?.message ?? '').includes('UNIQUE')) throw new HttpError(409, 'An authority already exists for this department, district, institution and level.');
    throw error;
  }
}));

adminRouter.patch('/authorities/:id', requireRole('admin'), h((req, res) => {
  const id = idParam(req);
  const body = parse(authoritySchema.partial(), req.body);
  const current = get<any>('SELECT * FROM department_authorities WHERE id = ?', id);
  if (!current) throw new HttpError(404, 'Authority not found.');
  const next = { departmentId: body.departmentId ?? current.department_id, district: body.district ?? current.district, institution: body.institution ?? current.institution, level: body.level ?? current.level, designation: body.designation ?? current.designation, authorityName: body.authorityName ?? current.authority_name, email: body.email ?? current.email, sourceUrl: body.sourceUrl ?? current.source_url, verified: body.verified ?? !!current.verified, active: body.active ?? !!current.active };
  if (next.verified && !/^https:\/\//i.test(next.sourceUrl)) throw new HttpError(422, 'A public HTTPS source is required before verification.');
  try {
    run('UPDATE department_authorities SET department_id=?, district=?, institution=?, level=?, designation=?, authority_name=?, email=?, source_url=?, verified=?, active=? WHERE id=?', next.departmentId, next.district, next.institution, next.level, next.designation, next.authorityName, next.email, next.sourceUrl, next.verified, next.active, id);
    audit(req.user!.id, 'authority.update', `authority:${id}`, { ...next, email: next.email });
    res.json({ ok: true });
  } catch (error: any) {
    if (String(error?.message ?? '').includes('UNIQUE')) throw new HttpError(409, 'An authority already exists for this department, district, institution and level.');
    throw error;
  }
}));

adminRouter.delete('/authorities/:id', requireRole('admin'), (req, res) => {
  const id = idParam(req);
  const current = get<any>('SELECT id, email FROM department_authorities WHERE id = ?', id);
  if (!current) throw new HttpError(404, 'Authority not found.');
  run('UPDATE department_authorities SET active = 0 WHERE id = ?', id);
  audit(req.user!.id, 'authority.deactivate', `authority:${id}`, { email: current.email });
  res.json({ ok: true });
});

adminRouter.get('/email-deliveries', requireRole('admin'), (_req, res) => {
  res.json({ items: all('SELECT id, complaint_id AS complaintId, recipient, recipient_type AS recipientType, subject, status, provider_id AS providerId, error, created_at AS createdAt FROM email_delivery_log ORDER BY id DESC LIMIT 200') });
});

/* ── Settings ───────────────────────────────────────────────── */

adminRouter.get('/settings', requireRole('admin'), (_req, res) => res.json(publicSettings()));

adminRouter.put('/settings', requireRole('admin'), h((req, res) => {
  const body = parse(
    z.object({
      openai_api_key: z.string().trim().max(300).optional(),
      clear_openai_key: z.boolean().optional(),
      openai_model: z.string().trim().min(2).max(80).optional(),
      openai_embed_model: z.string().trim().min(2).max(80).optional(),
      ai_enabled: z.boolean().optional(),
      sla_p1_hours: z.number().int().min(1).max(2160).optional(),
      sla_p2_hours: z.number().int().min(1).max(2160).optional(),
      sla_p3_hours: z.number().int().min(1).max(2160).optional(),
      sla_p4_hours: z.number().int().min(1).max(2160).optional(),
      verify_sla_hours: z.number().int().min(1).max(720).optional(),
      auto_escalate_p1: z.boolean().optional(),
      duplicate_threshold: z.number().min(0.5).max(0.99).optional(),
      similar_threshold: z.number().min(0.1).max(0.9).optional(),
      reopen_window_days: z.number().int().min(1).max(90).optional(),
    }),
    req.body,
  );
  const { clear_openai_key, ...patch } = body;
  if (clear_openai_key) (patch as any).openai_api_key = '';
  else if (!patch.openai_api_key) delete patch.openai_api_key;
  updateSettings(patch);
  audit(req.user!.id, 'settings.update', '', { keys: Object.keys(patch).map((k) => (k === 'openai_api_key' ? 'openai_api_key(redacted)' : k)) });
  res.json(publicSettings());
}));

adminRouter.post('/settings/test-openai', requireRole('admin'), h(async (_req, res) => {
  try {
    res.json(await testConnection());
  } catch (e: any) {
    throw new HttpError(502, e.message);
  }
}));

/* ── Audit ──────────────────────────────────────────────────── */

adminRouter.get('/audit', requireRole('admin'), (_req, res) => {
  res.json({ items: all('SELECT l.id, l.action, l.target, l.meta, l.created_at AS createdAt, u.name AS actor, u.role FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT 200') });
});
