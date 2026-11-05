import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { all, get, run, tx, nowIso, json, audit } from '../db.js';
import { requireAuth, requireRole, type AuthUser } from '../auth.js';
import { parse, h, z, idParam } from '../validate.js';
import {
  addEvent,
  changeStatus,
  escalate,
  HttpError,
  makeRef,
  STATUS_LABEL,
  OPEN_STATUSES,
  type Status,
} from '../services.js';
import { publishComplaint, notify, notifyRole } from '../events.js';
import { analyzeComplaint, isAnalyzing, type Analysis } from '../ai/pipeline.js';
import { forgetEmbedding } from '../ai/similarity.js';
import { scheduleRetrain } from '../ai/classifier.js';
import { CATEGORIES, categoryByKey, categoryLabel, domainLabel, districtNames, DISTRICTS } from '../ai/taxonomy.js';
import { getSettings, slaHoursFor } from '../settings.js';
import { sendEmail } from '../notifications.js';

export const complaintsRouter = Router();
complaintsRouter.use(requireAuth);

/* ── Uploads (FR4) ─────────────────────────────────────────────── */

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf|video\/mp4|audio\/(mpeg|mp4|wav|ogg|webm))$/;
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
  }),
  limits: { fileSize: config.maxUploadBytes, files: config.maxUploadFiles },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(415, `“${file.originalname}” is not a supported file type. Use images, PDF, MP4 video or audio.`));
  },
});

function saveAttachments(complaintId: number, files: Express.Multer.File[] | undefined, userId: number) {
  for (const f of files ?? []) {
    run('INSERT INTO attachments (complaint_id, filename, stored_name, mime, size, uploaded_by) VALUES (?,?,?,?,?,?)', complaintId, f.originalname.slice(0, 180), f.filename, f.mimetype, f.size, userId);
  }
}

/* ── Access & serialisation ───────────────────────────────────── */

interface Row {
  id: number; ref: string; user_id: number; title: string; body_original: string; language: string | null; body_english: string | null; translation_method: string | null;
  location_input: string; district_input: string; pincode: string; incident_date: string | null; domain: string | null; category: string | null; confidence: number | null;
  severity: number | null; priority: string | null; location_text: string | null; district: string | null; department_id: number | null; status: Status; ai_engine: string | null;
  ai_json: string | null; ai_error: string | null; duplicate_of: number | null; duplicate_score: number | null; escalation_level: number; escalated_at: string | null;
  escalation_reason: string | null; sla_due_at: string | null; resolution_note: string | null; reopen_count: number; verified_by: number | null; verified_at: string | null;
  assigned_at: string | null; resolved_at: string | null; closed_at: string | null; created_at: string; updated_at: string;
  dept_code?: string; dept_name?: string; citizen_name?: string; citizen_email?: string; citizen_phone?: string; attachment_count?: number;
}

const BASE_SELECT = `
  SELECT c.*, d.code AS dept_code, d.name AS dept_name, u.name AS citizen_name, u.email AS citizen_email, u.phone AS citizen_phone,
         (SELECT COUNT(*) FROM attachments a WHERE a.complaint_id = c.id) AS attachment_count
    FROM complaints c
    LEFT JOIN departments d ON d.id = c.department_id
    JOIN users u ON u.id = c.user_id`;

function canView(row: Row, u: AuthUser) {
  if (u.role === 'admin') return true;
  if (u.role === 'citizen') return row.user_id === u.id;
  return row.department_id != null && row.department_id === u.department_id && !!row.verified_at;
}

function load(id: number, u: AuthUser): Row {
  const row = get<Row>(`${BASE_SELECT} WHERE c.id = ?`, id);
  if (!row || !canView(row, u)) throw new HttpError(404, 'Complaint not found.');
  return row;
}

const isStaff = (u: AuthUser) => u.role !== 'citizen';

function serialize(r: Row, u: AuthUser) {
  const overdue = !!r.sla_due_at && ['assigned', 'in_progress', 'on_hold', 'reopened'].includes(r.status) && Date.parse(r.sla_due_at) < Date.now();
  const staff = isStaff(u);
  return {
    id: r.id, ref: r.ref, title: r.title, status: r.status, statusLabel: STATUS_LABEL[r.status],
    domain: r.domain, domainLabel: domainLabel(r.domain), category: r.category, categoryLabel: categoryLabel(r.category),
    severity: r.severity, priority: r.priority, confidence: staff ? r.confidence : undefined,
    district: r.district, locationText: r.location_text || r.location_input || null, language: r.language,
    department: r.department_id && (staff || r.verified_at) ? { id: r.department_id, code: r.dept_code, name: r.dept_name } : null,
    escalationLevel: r.escalation_level, escalatedAt: r.escalated_at, escalationReason: r.escalation_reason,
    slaDueAt: r.sla_due_at, overdue, assignedAt: r.assigned_at, resolvedAt: r.resolved_at, closedAt: r.closed_at,
    verifiedAt: r.verified_at, createdAt: r.created_at, updatedAt: r.updated_at, attachmentCount: r.attachment_count ?? 0,
    duplicateScore: staff ? r.duplicate_score : undefined, aiEngine: staff ? r.ai_engine : undefined,
    analyzing: r.status === 'analyzing' || isAnalyzing(r.id),
    citizen: staff ? { name: r.citizen_name, email: r.citizen_email, phone: r.citizen_phone } : undefined,
  };
}

function detail(r: Row, u: AuthUser) {
  const staff = isStaff(u);
  const ai = json<Analysis | null>(r.ai_json, null);
  const events = all<{ id: number; type: string; from_status: string | null; to_status: string | null; message: string; meta: string | null; actor_id: number | null; visibility: string; created_at: string; actor_name: string | null; actor_role: string | null }>(
    `SELECT e.*, a.name AS actor_name, a.role AS actor_role FROM complaint_events e LEFT JOIN users a ON a.id = e.actor_id
      WHERE e.complaint_id = ? ${staff ? '' : "AND e.visibility = 'public'"} ORDER BY e.id ASC`,
    r.id,
  ).map((e) => ({
    id: e.id, type: e.type, from: e.from_status, to: e.to_status, message: e.message, meta: json(e.meta, null), visibility: e.visibility, createdAt: e.created_at,
    actor: e.actor_id ? { name: staff || e.actor_role === 'citizen' ? e.actor_name : e.actor_role === 'admin' ? 'Grievance Cell' : 'Department Officer', role: e.actor_role } : null,
  }));
  const attachments = all('SELECT id, filename, mime, size, created_at AS createdAt FROM attachments WHERE complaint_id = ? ORDER BY id', r.id);
  const assignedOfficer = r.department_id ? get<{ id: number; name: string; email: string; phone: string }>(
    "SELECT id, name, email, phone FROM users WHERE role = 'officer' AND status = 'active' AND department_id = ? ORDER BY id LIMIT 1", r.department_id,
  ) : null;
  const fb = get<{ rating: number; satisfied: number; comment: string; created_at: string }>('SELECT rating, satisfied, comment, created_at FROM feedback WHERE complaint_id = ? ORDER BY id DESC LIMIT 1', r.id);
  const feedbackForCurrentResolution = !!(fb && r.resolved_at && Date.parse(fb.created_at) >= Date.parse(r.resolved_at));
  const duplicateOf = r.duplicate_of ? get<{ id: number; ref: string; status: string }>('SELECT id, ref, status FROM complaints WHERE id = ?', r.duplicate_of) : null;
  const s = getSettings();
  const reopenDeadline = r.resolved_at ? Date.parse(r.resolved_at) + s.reopen_window_days * 86_400_000 : 0;

  const permissions = {
    canWithdraw: u.role === 'citizen' && ['submitted', 'analyzing', 'awaiting_verification'].includes(r.status),
    canComment: !['withdrawn', 'merged', 'rejected', 'closed'].includes(r.status) || staff,
    canAttach: u.role === 'citizen' && OPEN_STATUSES.includes(r.status),
    canFeedback: u.role === 'citizen' && r.status === 'resolved' && !feedbackForCurrentResolution,
    canReopen: u.role === 'citizen' && r.status === 'resolved' && r.reopen_count < 1 && Date.now() < reopenDeadline,
    canVerify: u.role === 'admin' && r.status === 'awaiting_verification' && !isAnalyzing(r.id),
    canReanalyze: u.role === 'admin' && ['awaiting_verification'].includes(r.status) && !isAnalyzing(r.id),
    canUpdateStatus: staff && ['assigned', 'in_progress', 'on_hold', 'reopened'].includes(r.status),
    canReturn: u.role === 'officer' && ['assigned', 'in_progress', 'on_hold'].includes(r.status),
    canReassign: u.role === 'admin' && ['assigned', 'in_progress', 'on_hold', 'reopened'].includes(r.status),
    canEscalate: u.role === 'admin' && ['awaiting_verification', 'assigned', 'in_progress', 'on_hold', 'reopened'].includes(r.status) && r.escalation_level < 3,
  };

  const corrections = staff
    ? all('SELECT k.field, k.ai_value AS aiValue, k.final_value AS finalValue, k.note, k.source, k.created_at AS createdAt, a.name AS actor FROM corrections k LEFT JOIN users a ON a.id = k.actor_id WHERE complaint_id = ? ORDER BY k.id', r.id)
    : undefined;

  return {
    ...serialize(r, u),
    body: r.body_original,
    bodyEnglish: r.body_english,
    translationMethod: r.translation_method,
    locationInput: r.location_input,
    districtInput: r.district_input,
    pincode: r.pincode,
    incidentDate: r.incident_date,
    resolutionNote: r.resolution_note,
    reopenCount: r.reopen_count,
    duplicateOf,
    events,
    attachments,
    assignedOfficer: r.verified_at && assignedOfficer ? assignedOfficer : null,
    feedback: fb ? { rating: fb.rating, satisfied: !!fb.satisfied, comment: fb.comment, createdAt: fb.created_at } : null,
    ai: staff
      ? ai
      : ai && {
          summary: ai.summary,
          language: { code: ai.language.code, label: ai.language.label },
          translation: { method: ai.translation.method },
          recommendation: r.verified_at ? { citizenMessage: ai.recommendation.citizenMessage, expectedDays: ai.recommendation.expectedDays } : null,
          trace: ai.trace.map((t) => ({ key: t.key, label: t.label, fr: t.fr, status: t.status, engine: t.engine, ms: t.ms })),
        },
    aiError: staff ? r.ai_error : undefined,
    corrections,
    permissions,
    reopenDeadline: reopenDeadline ? new Date(reopenDeadline).toISOString() : null,
  };
}

/* ── List & search ────────────────────────────────────────────── */

function listWhere(u: AuthUser, q: Record<string, string | undefined>) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (u.role === 'citizen') { where.push('c.user_id = ?'); params.push(u.id); }
  if (u.role === 'officer') { where.push('c.department_id = ? AND c.verified_at IS NOT NULL'); params.push(u.department_id ?? -1); }
  const multi = (col: string, v?: string) => {
    if (!v) return;
    const vals = v.split(',').filter(Boolean);
    if (!vals.length) return;
    where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
    params.push(...vals);
  };
  if (q.status === 'open') where.push(`c.status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(',')})`);
  else multi('c.status', q.status);
  multi('c.domain', q.domain);
  multi('c.category', q.category);
  multi('c.priority', q.priority);
  multi('c.district', q.district);
  if (q.department) { where.push('c.department_id = ?'); params.push(Number(q.department)); }
  if (q.escalated === '1') where.push('c.escalation_level > 0');
  if (q.overdue === '1') where.push(`c.sla_due_at IS NOT NULL AND c.sla_due_at < ? AND c.status IN ('assigned','in_progress','on_hold','reopened')`), params.push(nowIso());
  if (q.q?.trim()) {
    const term = `%${q.q.trim().toLowerCase()}%`;
    where.push('(LOWER(c.ref) LIKE ? OR LOWER(c.title) LIKE ? OR LOWER(c.body_original) LIKE ? OR LOWER(COALESCE(c.body_english, \'\')) LIKE ? OR LOWER(COALESCE(c.location_text, \'\')) LIKE ?)');
    params.push(term, term, term, term, term);
  }
  if (q.from) { where.push('c.created_at >= ?'); params.push(q.from); }
  if (q.to) { where.push('c.created_at <= ?'); params.push(q.to); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SORTS: Record<string, string> = {
  newest: 'c.id DESC',
  oldest: 'c.id ASC',
  priority: "CASE c.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 ELSE 5 END, c.severity DESC, c.id ASC",
  sla: 'CASE WHEN c.sla_due_at IS NULL THEN 1 ELSE 0 END, c.sla_due_at ASC',
  updated: 'c.updated_at DESC',
  severity: 'c.severity DESC, c.id DESC',
};

complaintsRouter.get('/', h((req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const { sql, params } = listWhere(req.user!, query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));
  const order = SORTS[String(req.query.sort)] ?? SORTS.newest;
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM complaints c ${sql}`, ...params)!.n;
  const rows = all<Row>(`${BASE_SELECT} ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  const cw = listWhere(req.user!, { ...query, status: undefined });
  const counts = all<{ status: string; n: number }>(`SELECT c.status, COUNT(*) AS n FROM complaints c ${cw.sql} GROUP BY c.status`, ...cw.params);
  res.json({ items: rows.map((r) => serialize(r, req.user!)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}));

complaintsRouter.get('/export.csv', requireRole('admin', 'officer'), h((req, res) => {
  const { sql, params } = listWhere(req.user!, req.query as Record<string, string | undefined>);
  const rows = all<Row>(`${BASE_SELECT} ${sql} ORDER BY c.id DESC LIMIT 10000`, ...params);
  const cols = ['ref', 'created_at', 'status', 'domain', 'category', 'severity', 'priority', 'district', 'dept_code', 'escalation_level', 'sla_due_at', 'resolved_at', 'title'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(','))].join('\n');
  audit(req.user!.id, 'complaints.export', '', { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="plumbline-complaints-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
}));

/* ── Create (FR3, FR4) ───────────────────────────────────────── */

complaintsRouter.post('/', requireRole('citizen'), upload.array('files', config.maxUploadFiles), h(async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  try {
    const body = parse(
      z.object({
        title: z.string().trim().min(6, 'Give your complaint a short title (at least 6 characters).').max(140, 'Keep the title under 140 characters.'),
        body: z.string().trim().min(30, 'Describe the issue in a little more detail (at least 30 characters).').max(5000, 'Please keep the description under 5000 characters.'),
        locationInput: z.string().trim().max(160).default(''),
        districtInput: z.string().trim().refine((v) => !v || districtNames.includes(v), 'Choose a district from the list.').default(''),
        pincode: z.string().trim().regex(/^([1-8]\d{5})?$/, 'Enter a valid 6-digit PIN code.').default(''),
        incidentDate: z.string().trim().refine((v) => !v || (!Number.isNaN(Date.parse(v)) && Date.parse(v) <= Date.now() + 86_400_000), 'Incident date cannot be in the future.').default(''),
        consent: z.union([z.literal('true'), z.literal(true)], { errorMap: () => ({ message: 'Please confirm the information is accurate.' }) }),
      }),
      req.body,
    );
    const today = get<{ n: number }>("SELECT COUNT(*) AS n FROM complaints WHERE user_id = ? AND created_at >= datetime('now','-1 day')", req.user!.id)!.n;
    if (today >= 10) throw new HttpError(429, 'You have filed 10 complaints in the last 24 hours. Please wait before filing more.');

    const id = tx(() => {
      const { lastId } = run(
        'INSERT INTO complaints (user_id, title, body_original, location_input, district_input, pincode, incident_date) VALUES (?,?,?,?,?,?,?)',
        req.user!.id, body.title, body.body, body.locationInput, body.districtInput, body.pincode, body.incidentDate || null,
      );
      run('UPDATE complaints SET ref = ? WHERE id = ?', makeRef(lastId), lastId);
      saveAttachments(lastId, files, req.user!.id);
      addEvent(lastId, { type: 'status', to: 'submitted', message: `Complaint received${files?.length ? ` with ${files.length} attachment${files.length > 1 ? 's' : ''}` : ''}.`, actorId: req.user!.id });
      return lastId;
    });
    const row = load(id, req.user!);
    const confirmation = `Complaint ${row.ref} has been received and is being analysed. Filed by ${row.citizen_name} (${row.citizen_email}), phone ${row.citizen_phone || 'not provided'}. An assigned officer's details will be sent once an official verifies and assigns the case.`;
    notify(req.user!.id, { complaintId: id, kind: 'success', title: `${row.ref} received`, body: confirmation });
    void sendEmail(row.citizen_email ?? '', `Complaint received · ${row.ref}`, [
      `Hello ${row.citizen_name}, your grievance has been successfully filed.`,
      `Complaint reference: ${row.ref}`,
      `Title: ${row.title}`,
      `Filed by: ${row.citizen_name} · ${row.citizen_email} · ${row.citizen_phone || 'Phone not provided'}`,
      'Current status: Submitted / under AI analysis. The assigned officer name, department, email and phone will be shared as soon as the complaint is verified and assigned.',
    ]);
    setImmediate(() => analyzeComplaint(id).catch((e) => console.error(e)));
    res.status(201).json({ complaint: serialize(row, req.user!) });
  } catch (e) {
    for (const f of files ?? []) fs.rm(f.path, { force: true }, () => {});
    throw e;
  }
}));

/* ── Read ───────────────────────────────────────────────────── */

complaintsRouter.get('/:id', h((req, res) => {
  const row = load(idParam(req), req.user!);
  res.json({ complaint: detail(row, req.user!) });
}));

complaintsRouter.get('/:id/attachments/:aid', h((req, res) => {
  const row = load(idParam(req), req.user!);
  const a = get<{ stored_name: string; filename: string; mime: string }>('SELECT stored_name, filename, mime FROM attachments WHERE id = ? AND complaint_id = ?', idParam(req, 'aid'), row.id);
  if (!a) throw new HttpError(404, 'Attachment not found.');
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.sendFile(path.join(config.uploadDir, a.stored_name));
}));

/* ── Citizen actions ───────────────────────────────────────── */

complaintsRouter.post('/:id/attachments', requireRole('citizen'), upload.array('files', config.maxUploadFiles), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const files = req.files as Express.Multer.File[];
  if (!OPEN_STATUSES.includes(row.status)) {
    for (const f of files ?? []) fs.rm(f.path, { force: true }, () => {});
    throw new HttpError(409, 'Evidence can only be added while the complaint is open.');
  }
  if (!files?.length) throw new HttpError(422, 'Choose at least one file.');
  const existing = get<{ n: number }>('SELECT COUNT(*) AS n FROM attachments WHERE complaint_id = ?', row.id)!.n;
  if (existing + files.length > 10) {
    for (const f of files) fs.rm(f.path, { force: true }, () => {});
    throw new HttpError(422, 'A complaint can have at most 10 attachments.');
  }
  saveAttachments(row.id, files, req.user!.id);
  addEvent(row.id, { type: 'attachment', message: `Added ${files.length} supporting file${files.length > 1 ? 's' : ''}.`, actorId: req.user!.id });
  publishComplaint(row.id, 'complaint.updated');
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/withdraw', requireRole('citizen'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(z.object({ reason: z.string().trim().max(500).default('') }), req.body);
  if (!['submitted', 'analyzing', 'awaiting_verification'].includes(row.status)) throw new HttpError(409, 'This complaint has already been assigned and can no longer be withdrawn.');
  changeStatus(row.id, 'withdrawn', { actorId: req.user!.id, message: body.reason ? `Withdrawn by citizen: ${body.reason}` : 'Withdrawn by citizen.', force: true, set: { closed_at: nowIso() } });
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/feedback', requireRole('citizen'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(
    z.object({
      rating: z.number().int().min(1, 'Choose a rating.').max(5),
      satisfied: z.boolean(),
      comment: z.string().trim().max(1000).default(''),
      reopen: z.boolean().default(false),
    }),
    req.body,
  );
  if (row.status !== 'resolved') throw new HttpError(409, 'Feedback can be given once the complaint is resolved.');
  if (get('SELECT 1 FROM feedback WHERE complaint_id = ? AND created_at >= ?', row.id, row.resolved_at ?? '')) throw new HttpError(409, 'You have already given feedback on this resolution.');
  const s = getSettings();
  const withinWindow = !!row.resolved_at && Date.now() < Date.parse(row.resolved_at) + s.reopen_window_days * 86_400_000;
  if (body.reopen && (body.satisfied || row.reopen_count >= 1 || !withinWindow)) {
    throw new HttpError(409, 'This complaint can no longer be reopened. Your feedback was not submitted; contact the grievance cell if the issue remains unresolved.');
  }

  tx(() => {
    run('INSERT INTO feedback (complaint_id, user_id, rating, satisfied, comment) VALUES (?,?,?,?,?)', row.id, req.user!.id, body.rating, body.satisfied ? 1 : 0, body.comment);
    addEvent(row.id, { type: 'feedback', message: `Citizen rated the resolution ${body.rating}/5${body.comment ? ` — “${body.comment}”` : ''}.`, actorId: req.user!.id, meta: { rating: body.rating, satisfied: body.satisfied } });
    if (!body.satisfied && body.reopen && row.reopen_count < 1 && withinWindow) {
      changeStatus(row.id, 'reopened', { actorId: req.user!.id, message: 'Reopened by citizen — resolution was not satisfactory.', set: { reopen_count: row.reopen_count + 1, resolved_at: null, sla_due_at: new Date(Date.now() + slaHoursFor('P2') * 3_600_000).toISOString() } });
      escalate(row.id, 'Citizen reported the resolution as unsatisfactory');
    } else {
      changeStatus(row.id, 'closed', { actorId: req.user!.id, message: body.satisfied ? 'Closed — citizen confirmed the resolution.' : 'Closed with citizen feedback recorded.', set: { closed_at: nowIso() } });
    }
  });
  if (row.department_id) notifyRole('officer', { complaintId: row.id, kind: body.rating >= 4 ? 'success' : 'warning', title: `${row.ref} rated ${body.rating}/5`, body: body.comment || (body.satisfied ? 'Citizen is satisfied.' : 'Citizen is not satisfied.') }, row.department_id);
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

/* ── Comments (both sides) ─────────────────────────────────── */

complaintsRouter.post('/:id/comments', h((req, res) => {
  const row = load(idParam(req), req.user!);
  const u = req.user!;
  const body = parse(z.object({ message: z.string().trim().min(2, 'Write a message.').max(2000), visibility: z.enum(['public', 'internal']).default('public') }), req.body);
  if (u.role === 'citizen' && ['withdrawn', 'merged', 'rejected', 'closed'].includes(row.status)) throw new HttpError(409, 'This complaint is closed for new messages.');
  const visibility = u.role === 'citizen' ? 'public' : body.visibility;
  addEvent(row.id, { type: 'comment', message: body.message, actorId: u.id, visibility });
  if (u.role === 'citizen') {
    if (row.department_id && row.verified_at) notifyRole('officer', { complaintId: row.id, kind: 'message', title: `New message on ${row.ref}`, body: body.message.slice(0, 140) }, row.department_id);
    else notifyRole('admin', { complaintId: row.id, kind: 'message', title: `New message on ${row.ref}`, body: body.message.slice(0, 140) });
  } else if (visibility === 'public') {
    notify(row.user_id, { complaintId: row.id, kind: 'message', title: `Update on ${row.ref}`, body: body.message.slice(0, 140) });
  }
  publishComplaint(row.id, 'complaint.updated');
  res.json({ complaint: detail(load(row.id, u), u) });
}));

/* ── Admin verification (FR19, FR20, FR15, FR25) ──────────── */

complaintsRouter.post('/:id/verify', requireRole('admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  if (row.status !== 'awaiting_verification') throw new HttpError(409, `Only complaints under verification can be assigned (this one is “${STATUS_LABEL[row.status]}”).`);
  if (isAnalyzing(row.id)) throw new HttpError(409, 'Analysis is still running — wait for it to finish.');
  const body = parse(
    z.object({
      domain: z.enum(['education', 'healthcare', 'public_service']),
      category: z.string().refine((v) => categoryByKey.has(v), 'Choose a category.'),
      severity: z.number().int().min(1).max(5),
      priority: z.enum(['P1', 'P2', 'P3', 'P4']),
      departmentId: z.number().int().positive('Choose a department.'),
      district: z.string().refine((v) => !v || districtNames.includes(v), 'Choose a district from the list.').default(''),
      locationText: z.string().trim().max(160).default(''),
      note: z.string().trim().max(1000).default(''),
      citizenMessage: z.string().trim().max(600).default(''),
    }).refine((b) => categoryByKey.get(b.category)?.domain === b.domain, { message: 'That category does not belong to the selected domain.', path: ['category'] }),
    req.body,
  );
  const dept = get<{ id: number; code: string; name: string; active: number }>('SELECT id, code, name, active FROM departments WHERE id = ?', body.departmentId);
  if (!dept || !dept.active) throw new HttpError(422, 'Choose an active department.', { fields: { departmentId: 'Choose an active department.' } });

  const ai = json<Analysis | null>(row.ai_json, null);
  const aiVals: Record<string, string | null> = ai
    ? { domain: ai.classification.domain, category: ai.classification.category, severity: String(ai.severity.level), priority: ai.priority.priority, department: ai.routing.departmentCode, district: ai.location.district ?? '' }
    : { domain: null, category: null, severity: null, priority: null, department: null, district: null };
  const finalVals: Record<string, string> = { domain: body.domain, category: body.category, severity: String(body.severity), priority: body.priority, department: dept.code, district: body.district };
  const changed = Object.keys(finalVals).filter((k) => (aiVals[k] ?? '') !== finalVals[k]);

  const now = new Date();
  const due = new Date(now.getTime() + slaHoursFor(body.priority) * 3_600_000).toISOString();
  tx(() => {
    for (const f of changed) {
      run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id) VALUES (?,?,?,?,?,?,?)', row.id, f, aiVals[f], finalVals[f], ai ? 'verification' : 'manual', body.note, req.user!.id);
    }
    run(
      `UPDATE complaints SET domain = ?, category = ?, severity = ?, priority = ?, department_id = ?, district = ?, location_text = ?, verified_by = ?, verified_at = ?, assigned_at = ?, sla_due_at = ? WHERE id = ?`,
      body.domain, body.category, body.severity, body.priority, dept.id, body.district || null, body.locationText || row.location_text, req.user!.id, now.toISOString(), now.toISOString(), due, row.id,
    );
    if (changed.length) {
      addEvent(row.id, {
        type: 'correction', visibility: 'internal', actorId: req.user!.id,
        message: `Reviewer adjusted ${changed.join(', ')}${body.note ? ` — ${body.note}` : ''}.`,
        meta: Object.fromEntries(changed.map((f) => [f, { from: aiVals[f], to: finalVals[f] }])),
      });
    } else {
      addEvent(row.id, { type: 'correction', visibility: 'internal', actorId: req.user!.id, message: 'Reviewer confirmed the AI analysis without changes.' });
    }
    changeStatus(row.id, 'assigned', { actorId: req.user!.id, message: `Verified and assigned to ${dept.name}. Target resolution by ${due.slice(0, 10)}.` });
  });
  audit(req.user!.id, 'complaint.verify', row.ref, { changed });
  scheduleRetrain(req.user!.id);

  const officer = get<{ name: string; email: string; phone: string }>(
    "SELECT name, email, phone FROM users WHERE role = 'officer' AND status = 'active' AND department_id = ? ORDER BY id LIMIT 1", dept.id,
  );
  const msg = `${body.citizenMessage || ai?.recommendation.citizenMessage || `Your complaint has been assigned to the ${dept.name}.`} ${officer ? `Assigned officer: ${officer.name}; ${officer.email}; ${officer.phone || 'phone not listed'}.` : 'The department will share officer contact details shortly.'}`;
  notify(row.user_id, { complaintId: row.id, kind: 'progress', title: `${row.ref} assigned to ${dept.code}`, body: msg });
  void sendEmail(row.citizen_email ?? '', `Officer assigned · ${row.ref}`, [
    `Your complaint ${row.ref} has been verified and assigned.`,
    `Complaint: ${row.title}`,
    `Department: ${dept.name}`,
    `Assigned officer: ${officer?.name ?? 'Officer details pending'}`,
    `Officer email: ${officer?.email ?? 'Will be shared shortly'}`,
    `Officer phone: ${officer?.phone ?? 'Will be shared shortly'}`,
    `Current status: Assigned · priority ${body.priority}`,
  ]);
  notifyRole('officer', { complaintId: row.id, kind: body.priority === 'P1' ? 'urgent' : 'assignment', title: `New ${body.priority} assignment · ${row.ref}`, body: `${categoryLabel(body.category)} · ${body.district || 'Location n/a'}` }, dept.id);
  if (body.priority === 'P1' && row.escalation_level === 0 && getSettings().auto_escalate_p1) escalate(row.id, 'Confirmed high priority (P1) at verification', req.user!.id);
  res.json({ complaint: detail(load(row.id, req.user!), req.user!), corrections: changed });
}));

complaintsRouter.post('/:id/reanalyze', requireRole('admin'), h(async (req, res) => {
  const row = load(idParam(req), req.user!);
  if (row.status !== 'awaiting_verification') throw new HttpError(409, 'Only complaints awaiting verification can be re-analysed.');
  if (isAnalyzing(row.id)) throw new HttpError(409, 'Analysis is already running.');
  forgetEmbedding(row.id);
  setImmediate(() => analyzeComplaint(row.id, { actorId: req.user!.id, rerun: true }).catch(console.error));
  res.json({ ok: true });
}));

complaintsRouter.post('/:id/merge', requireRole('admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(z.object({ original: z.string().trim().min(1, 'Enter the original complaint reference.'), note: z.string().trim().max(500).default('') }), req.body);
  if (row.status !== 'awaiting_verification') throw new HttpError(409, 'Only complaints under verification can be merged.');
  const orig = get<{ id: number; ref: string; status: string; user_id: number }>('SELECT id, ref, status, user_id FROM complaints WHERE ref = ? OR id = ?', body.original.toUpperCase(), Number(body.original) || -1);
  if (!orig || orig.id === row.id) throw new HttpError(422, 'Original complaint not found.', { fields: { original: 'No complaint with that reference.' } });
  if (['withdrawn', 'rejected', 'merged'].includes(orig.status)) throw new HttpError(422, 'The original complaint is not active.', { fields: { original: `${orig.ref} is ${orig.status}.` } });
  const ai = json<Analysis | null>(row.ai_json, null);
  tx(() => {
    run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id) VALUES (?,?,?,?,?,?,?)', row.id, 'duplicate', ai?.similarity.duplicates[0]?.ref ?? 'none', orig.ref, 'verification', body.note, req.user!.id);
    changeStatus(row.id, 'merged', { actorId: req.user!.id, message: `Merged into ${orig.ref} — the same issue is already being handled.${body.note ? ` ${body.note}` : ''}`, set: { duplicate_of: orig.id, closed_at: nowIso() } });
    addEvent(orig.id, { type: 'comment', visibility: 'internal', actorId: req.user!.id, message: `Duplicate report ${row.ref} merged into this complaint.` });
  });
  audit(req.user!.id, 'complaint.merge', row.ref, { into: orig.ref });
  notify(row.user_id, { complaintId: row.id, kind: 'info', title: `${row.ref} linked to ${orig.ref}`, body: 'The same issue was already reported and is being handled. You will see progress on the original.' });
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/reject', requireRole('admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(z.object({ reason: z.string().trim().min(10, 'Explain the reason to the citizen (at least 10 characters).').max(800) }), req.body);
  if (row.status !== 'awaiting_verification') throw new HttpError(409, 'Only complaints under verification can be rejected.');
  changeStatus(row.id, 'rejected', { actorId: req.user!.id, message: body.reason, set: { closed_at: nowIso() } });
  audit(req.user!.id, 'complaint.reject', row.ref);
  notify(row.user_id, { complaintId: row.id, kind: 'warning', title: `${row.ref} could not be accepted`, body: body.reason });
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/escalate', requireRole('admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(z.object({ reason: z.string().trim().min(5, 'Give a reason.').max(300) }), req.body);
  if (row.escalation_level >= 3) throw new HttpError(409, 'Already at the highest escalation level.');
  escalate(row.id, `Manual: ${body.reason}`, req.user!.id);
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/reassign', requireRole('admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(z.object({ departmentId: z.number().int().positive(), note: z.string().trim().max(500).default('') }), req.body);
  const dept = get<{ id: number; code: string; name: string }>('SELECT id, code, name FROM departments WHERE id = ? AND active = 1', body.departmentId);
  if (!dept) throw new HttpError(422, 'Choose an active department.');
  if (dept.id === row.department_id) throw new HttpError(422, 'The complaint is already with this department.');
  const prev = row.dept_code;
  run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id) VALUES (?,?,?,?,?,?,?)', row.id, 'department', prev ?? null, dept.code, 'reassignment', body.note, req.user!.id);
  run('UPDATE complaints SET department_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?', dept.id, nowIso(), nowIso(), row.id);
  addEvent(row.id, { type: 'assignment', message: `Transferred from ${prev} to ${dept.name}.${body.note ? ` ${body.note}` : ''}`, actorId: req.user!.id });
  notifyRole('officer', { complaintId: row.id, kind: 'assignment', title: `Transferred to you · ${row.ref}`, body: categoryLabel(row.category) }, dept.id);
  publishComplaint(row.id, 'complaint.updated');
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

/* ── Department work (FR22) ────────────────────────────────── */

complaintsRouter.post('/:id/status', requireRole('officer', 'admin'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(
    z.object({
      status: z.enum(['in_progress', 'on_hold', 'resolved']),
      message: z.string().trim().max(1500).default(''),
      resolutionNote: z.string().trim().max(2000).default(''),
    }).refine((b) => b.status !== 'resolved' || b.resolutionNote.length >= 15, { message: 'Describe what was done to resolve this (at least 15 characters).', path: ['resolutionNote'] })
      .refine((b) => b.status !== 'on_hold' || b.message.length >= 5, { message: 'Tell the citizen why the work is on hold.', path: ['message'] }),
    req.body,
  );
  const set: Record<string, unknown> = {};
  if (body.status === 'resolved') Object.assign(set, { resolved_at: nowIso(), resolution_note: body.resolutionNote });
  const r = changeStatus(row.id, body.status, {
    actorId: req.user!.id,
    message: body.status === 'resolved' ? `Resolved: ${body.resolutionNote}` : body.message || (body.status === 'in_progress' ? 'Work has started on your complaint.' : ''),
    set,
  });
  const titles: Record<string, string> = { in_progress: 'Work started', on_hold: 'Put on hold', resolved: 'Marked resolved — please rate the outcome' };
 notify(row.user_id, { complaintId: row.id, kind: body.status === 'resolved' ? 'success' : 'progress', title: `${row.ref} · ${titles[body.status]}`, body: body.status === 'resolved' ? body.resolutionNote.slice(0, 160) : body.message.slice(0, 160) });
  res.json({ complaint: detail(load(row.id, req.user!), req.user!) });
}));

complaintsRouter.post('/:id/return', requireRole('officer'), h((req, res) => {
  const row = load(idParam(req), req.user!);
  const body = parse(
    z.object({
      reason: z.string().trim().min(10, 'Explain why this is not for your department (at least 10 characters).').max(800),
      suggestedCategory: z.string().refine((v) => !v || categoryByKey.has(v)).default(''),
    }),
    req.body,
  );
  tx(() => {
    run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id) VALUES (?,?,?,?,?,?,?)', row.id, 'department', row.dept_code ?? null, 'returned', 'officer_return', body.reason, req.user!.id);
    if (body.suggestedCategory) run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id) VALUES (?,?,?,?,?,?,?)', row.id, 'category', row.category, body.suggestedCategory, 'officer_return', body.reason, req.user!.id);
    changeStatus(row.id, 'awaiting_verification', { actorId: req.user!.id, visibility: 'internal', message: `Returned by ${row.dept_code}: ${body.reason}`, set: { verified_at: null, assigned_at: null, sla_due_at: null } });
    addEvent(row.id, { type: 'assignment', message: 'Being re-routed to the correct department.', actorId: null });
  });
  notifyRole('admin', { complaintId: row.id, kind: 'review', title: `${row.ref} returned by ${row.dept_code}`, body: body.reason });
  res.json({ ok: true });
}));

/* ── Taxonomy helper for forms ─────────────────────────────── */

export function taxonomyPayload() {
  return {
    categories: CATEGORIES.map((c) => ({ key: c.key, domain: c.domain, label: c.label, description: c.description, dept: c.dept, baseSeverity: c.baseSeverity })),
    districts: DISTRICTS.map((d) => ({ name: d.name, state: d.state })),
  };
}
