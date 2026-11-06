/**
 * Server-Sent Events hub for real-time tracking (FR21) plus the in-app
 * notification inbox.
 */
import type { Response } from 'express';
import { all, get, run } from './db.js';
import { sendCitizenNotificationEmail } from './email.js';

interface Client { res: Response; userId: number; role: string; departmentId: number | null }
const clients = new Set<Client>();

export function subscribe(res: Response, user: { id: number; role: string; department_id: number | null }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 4000\n\n`);
  const c: Client = { res, userId: user.id, role: user.role, departmentId: user.department_id };
  clients.add(c);
  send(c, 'hello', { at: new Date().toISOString() });
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(c);
  });
}

function send(c: Client, event: string, data: unknown) {
  c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function publish(filter: (c: Client) => boolean, event: string, data: unknown) {
  for (const c of clients) if (filter(c)) send(c, event, data);
}

/** Fan a complaint event out to its owner, admins and the assigned department. */
export function publishComplaint(complaintId: number, event: string, data: Record<string, unknown> = {}) {
  const row = get<{ user_id: number; department_id: number | null; status: string }>('SELECT user_id, department_id, status FROM complaints WHERE id = ?', complaintId);
  if (!row) return;
  const payload = { complaintId, status: row.status, ...data };
  publish(
    (c) => c.role === 'admin' || c.userId === row.user_id || (c.role === 'officer' && row.department_id != null && c.departmentId === row.department_id),
    event,
    payload,
  );
}

export function liveCount() {
  return clients.size;
}

/* ── Notifications ─────────────────────────────────────────────── */

export function notify(userId: number, n: { complaintId?: number | null; kind?: string; title: string; body?: string }) {
  const { lastId } = run(
    'INSERT INTO notifications (user_id, complaint_id, kind, title, body) VALUES (?,?,?,?,?)',
    userId, n.complaintId ?? null, n.kind ?? 'info', n.title, n.body ?? '',
  );
  const row = get('SELECT * FROM notifications WHERE id = ?', lastId);
  publish((c) => c.userId === userId, 'notification', row);
  // Keep the in-app notification immediate; send email asynchronously so a mail outage
  // never blocks complaint processing. Only citizen accounts receive these emails.
  void sendCitizenNotificationEmail(userId, n).catch((error) => {
    console.error('Citizen email delivery error:', error instanceof Error ? error.message : String(error));
  });
}

export function notifyRole(role: 'admin' | 'officer', n: Parameters<typeof notify>[1], departmentId?: number | null) {
  const users = all<{ id: number }>(
    role === 'officer' ? "SELECT id FROM users WHERE role = 'officer' AND status = 'active' AND department_id = ?" : "SELECT id FROM users WHERE role = 'admin' AND status = 'active'",
    ...(role === 'officer' ? [departmentId ?? -1] : []),
  );
  for (const u of users) notify(u.id, n);
}
