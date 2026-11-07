import { get, run, nowIso } from './db.js';
import { publishComplaint, notify, notifyRole } from './events.js';
import { emailAuthorityForComplaint } from './authority-routing.js';

export const STATUSES = [
  'submitted', 'analyzing', 'awaiting_verification', 'assigned', 'in_progress', 'on_hold',
  'resolved', 'closed', 'reopened', 'withdrawn', 'rejected', 'merged',
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  submitted: 'Submitted', analyzing: 'Analysing', awaiting_verification: 'Under verification', assigned: 'Assigned',
  in_progress: 'In progress', on_hold: 'On hold', resolved: 'Resolved', closed: 'Closed', reopened: 'Reopened',
  withdrawn: 'Withdrawn', rejected: 'Rejected', merged: 'Merged as duplicate',
};

export const OPEN_STATUSES: Status[] = ['submitted', 'analyzing', 'awaiting_verification', 'assigned', 'in_progress', 'on_hold', 'reopened'];
export const ACTIVE_WORK: Status[] = ['assigned', 'in_progress', 'on_hold', 'reopened'];

/** FR22 — legal transitions through the resolution stages. */
const TRANSITIONS: Record<Status, Status[]> = {
  submitted: ['analyzing', 'awaiting_verification', 'withdrawn'],
  analyzing: ['awaiting_verification', 'withdrawn'],
  awaiting_verification: ['assigned', 'rejected', 'merged', 'withdrawn', 'analyzing'],
  assigned: ['in_progress', 'on_hold', 'resolved', 'awaiting_verification'],
  in_progress: ['on_hold', 'resolved', 'awaiting_verification'],
  on_hold: ['in_progress', 'resolved', 'awaiting_verification'],
  resolved: ['closed', 'reopened'],
  reopened: ['in_progress', 'on_hold', 'resolved'],
  closed: [],
  withdrawn: [],
  rejected: [],
  merged: [],
};

export function canTransition(from: Status, to: Status) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function addEvent(
  complaintId: number,
  e: { type: string; from?: string | null; to?: string | null; message?: string; actorId?: number | null; visibility?: 'public' | 'internal'; meta?: unknown },
) {
  run(
    'INSERT INTO complaint_events (complaint_id, type, from_status, to_status, message, meta, actor_id, visibility) VALUES (?,?,?,?,?,?,?,?)',
    complaintId, e.type, e.from ?? null, e.to ?? null, e.message ?? '', e.meta === undefined ? null : JSON.stringify(e.meta), e.actorId ?? null, e.visibility ?? 'public',
  );
}

export function changeStatus(
  id: number,
  to: Status,
  opts: { actorId?: number | null; message?: string; visibility?: 'public' | 'internal'; set?: Record<string, unknown>; force?: boolean } = {},
) {
  const c = get<{ status: Status; user_id: number; ref: string; title: string }>('SELECT status, user_id, ref, title FROM complaints WHERE id = ?', id);
  if (!c) throw new HttpError(404, 'Complaint not found');
  if (!opts.force && c.status !== to && !canTransition(c.status, to)) {
    throw new HttpError(409, `Cannot move a complaint from “${STATUS_LABEL[c.status]}” to “${STATUS_LABEL[to]}”.`);
  }
  const set = { ...(opts.set ?? {}), status: to, updated_at: nowIso() };
  const cols = Object.keys(set);
  run(`UPDATE complaints SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...(Object.values(set) as any[]), id);
  if (c.status !== to) {
    addEvent(id, { type: 'status', from: c.status, to, message: opts.message ?? '', actorId: opts.actorId, visibility: opts.visibility ?? 'public' });
  }
  publishComplaint(id, 'complaint.updated', { from: c.status, to });
  return { from: c.status, to, ownerId: c.user_id, ref: c.ref, title: c.title };
}

/** FR23 — automatic hierarchical escalation to the next verified public authority. */
export function escalate(id: number, reason: string, actorId: number | null = null) {
  const c = get<{ escalation_level: number; user_id: number; ref: string; department_id: number | null; district: string | null; title: string }>(
    'SELECT escalation_level, user_id, ref, department_id, district, title FROM complaints WHERE id = ?', id,
  );
  if (!c) return;
  const nextLevel = Math.max(1, c.escalation_level) + 1;
  if (!c.department_id) {
    notifyRole('admin', { complaintId: id, kind: 'warning', title: `${c.ref} cannot be escalated`, body: 'No department is assigned. Admin review is required.' });
    return;
  }
  // Temporarily claim this overdue stage so overlapping scheduler ticks cannot send duplicates.
  run('UPDATE complaints SET sla_due_at = ?, updated_at = ? WHERE id = ?', new Date(Date.now() + 10 * 60_000).toISOString(), nowIso(), id);
  // Do not silently skip a missing level or invent an email address.
  void emailAuthorityForComplaint(id, nextLevel, reason).then((sentToAuthority) => {
    if (!sentToAuthority) {
      const retryAt = new Date(Date.now() + 86_400_000).toISOString();
      run('UPDATE complaints SET sla_due_at = ?, updated_at = ? WHERE id = ?', retryAt, nowIso(), id);
      addEvent(id, { type: 'routing_blocked', message: `Automatic escalation to level ${nextLevel} is waiting for a verified public authority email address.`, actorId, visibility: 'internal', meta: { requestedLevel: nextLevel } });
      notifyRole('admin', { complaintId: id, kind: 'warning', title: `${c.ref} needs an authority email`, body: `Add and verify the official public email for escalation level ${nextLevel}, and check Resend delivery configuration. Automatic forwarding is paused until then.` });
      notify(c.user_id, { complaintId: id, kind: 'warning', title: `Update on complaint ${c.ref}`, body: 'The next authority email is not yet verified. Plumbline has alerted the administrator to complete the routing details.' });
      return;
    }
    run('UPDATE complaints SET escalated_at = ?, escalation_reason = ?, updated_at = ? WHERE id = ?', nowIso(), reason, nowIso(), id);
    addEvent(id, { type: 'escalation', message: `Automatically escalated to authority level ${nextLevel}: ${reason}`, actorId, visibility: 'public', meta: { level: nextLevel, reason } });
    notifyRole('admin', { complaintId: id, kind: 'escalation', title: `${c.ref} escalated · L${nextLevel}`, body: reason });
    notify(c.user_id, { complaintId: id, kind: 'escalation', title: `Your complaint ${c.ref} was escalated`, body: `It has been forwarded to the next higher authority (level ${nextLevel}).` });
    publishComplaint(id, 'complaint.updated', { escalated: nextLevel });
  }).catch((error) => console.error(`[escalation] ${c.ref} forwarding failed:`, error));
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function makeRef(id: number, createdAt = new Date()) {
  const yy = String(createdAt.getUTCFullYear()).slice(2);
  const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  return `PLB-${yy}${mm}-${String(id).padStart(5, '0')}`;
}
