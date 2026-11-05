/**
 * FR23 — periodic SLA sweep:
 *  · work past its due time escalates one level (and again every half-SLA),
 *  · complaints stuck in verification escalate to the grievance cell,
 *  · resolved complaints with no citizen response auto-close after the reopen window.
 */
import { all, nowIso } from '../db.js';
import { escalate, changeStatus } from '../services.js';
import { getSettings } from '../settings.js';

export function sweep() {
  const s = getSettings();
  const now = Date.now();
  let escalated = 0;
  let closed = 0;

  const overdue = all<{ id: number; sla_due_at: string; escalation_level: number; escalated_at: string | null; assigned_at: string | null }>(
    `SELECT id, sla_due_at, escalation_level, escalated_at, assigned_at FROM complaints
      WHERE status IN ('assigned','in_progress','on_hold','reopened') AND sla_due_at IS NOT NULL AND sla_due_at < ? AND escalation_level < 3`,
    nowIso(),
  );
  for (const c of overdue) {
    const window = Math.max(1, (Date.parse(c.sla_due_at) - Date.parse(c.assigned_at ?? c.sla_due_at)) / 2);
    const last = c.escalated_at ? Date.parse(c.escalated_at) : 0;
    if (last < Date.parse(c.sla_due_at) || now - last >= window) {
      const hrs = Math.round((now - Date.parse(c.sla_due_at)) / 3_600_000);
      escalate(c.id, `Resolution deadline missed${hrs > 0 ? ` by ${hrs}h` : ''}`);
      escalated++;
    }
  }

  const stuck = all<{ id: number }>(
    `SELECT id FROM complaints WHERE status = 'awaiting_verification' AND escalation_level = 0 AND updated_at < ?`,
    new Date(now - s.verify_sla_hours * 3_600_000).toISOString(),
  );
  for (const c of stuck) {
    escalate(c.id, `Pending verification for more than ${s.verify_sla_hours}h`);
    escalated++;
  }

  const stale = all<{ id: number }>(
    `SELECT id FROM complaints WHERE status = 'resolved' AND resolved_at < ?`,
    new Date(now - s.reopen_window_days * 86_400_000).toISOString(),
  );
  for (const c of stale) {
    changeStatus(c.id, 'closed', { message: `Closed automatically — no response within ${s.reopen_window_days} days of resolution.`, set: { closed_at: nowIso() } });
    closed++;
  }
  if (escalated || closed) console.log(`[sla] escalated ${escalated}, auto-closed ${closed}`);
  return { escalated, closed };
}

export function startScheduler(intervalMs = 60_000) {
  setTimeout(sweep, 5_000);
  return setInterval(() => {
    try {
      sweep();
    } catch (e) {
      console.error('[sla] sweep failed', e);
    }
  }, intervalMs);
}
