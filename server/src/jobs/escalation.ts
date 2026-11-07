/**
 * FR23 — periodic SLA sweep:
 *  · overdue work is forwarded to the next configured authority using level-specific deadlines,
 *  · complaints stuck in verification escalate to the grievance cell,
 *  · resolved complaints with no citizen response auto-close after the reopen window.
 */
import { all, nowIso } from '../db.js';
import { notifyRole } from '../events.js';
import { startAuthorityRouting } from '../authority-routing.js';
import { escalate, changeStatus } from '../services.js';
import { getSettings } from '../settings.js';

export function sweep() {
  const s = getSettings();
  const now = Date.now();
  let escalated = 0;
  let closed = 0;

  const pendingInitial = all<{ id: number }>(
    `SELECT c.id FROM complaints c
      WHERE c.status IN ('assigned','in_progress','on_hold','reopened') AND c.escalation_level = 0 AND c.updated_at < datetime('now','-10 minutes')
        AND c.department_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM department_authorities a WHERE a.department_id = c.department_id AND a.level = 1 AND a.active = 1 AND a.verified = 1
          AND (LOWER(TRIM(a.district)) = LOWER(TRIM(COALESCE(c.district, c.district_input, ''))) OR a.district = '')
          AND (LOWER(TRIM(a.institution)) = LOWER(TRIM(c.institution_input)) OR a.institution = ''))`,
  );
  for (const c of pendingInitial) {
    void startAuthorityRouting(c.id).catch((error) => console.error('[authority] retry initial routing failed:', error));
  }

  const overdue = all<{ id: number; sla_due_at: string; escalation_level: number; escalated_at: string | null; assigned_at: string | null }>(
    `SELECT id, sla_due_at, escalation_level, escalated_at, assigned_at FROM complaints
      WHERE status IN ('assigned','in_progress','on_hold','reopened') AND sla_due_at IS NOT NULL AND sla_due_at < ? AND escalation_level >= 1`,
    nowIso(),
  );
  for (const c of overdue) {
    const hrs = Math.max(0, Math.round((now - Date.parse(c.sla_due_at)) / 3_600_000));
    escalate(c.id, `Level ${c.escalation_level} resolution deadline missed${hrs > 0 ? ` by ${hrs}h` : ''}`);
    escalated++;
  }

  const stuck = all<{ id: number }>(
    `SELECT id FROM complaints WHERE status = 'awaiting_verification' AND escalation_level = 0 AND updated_at < ?`,
    new Date(now - s.verify_sla_hours * 3_600_000).toISOString(),
  );
  for (const c of stuck) {
    notifyRole('admin', { complaintId: c.id, kind: 'warning', title: 'Complaint needs verification review', body: `Pending verification for more than ${s.verify_sla_hours} hours.` });
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
