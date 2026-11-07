import { all, get, run, nowIso } from './db.js';

export interface Authority {
  id: number;
  department_id: number;
  district: string;
  institution: string;
  level: number;
  designation: string;
  authority_name: string;
  email: string;
  source_url: string;
  verified: number;
  active: number;
}

export function deadlineDaysForLevel(level: number) {
  if (level <= 2) return 3;
  if (level <= 4) return 5;
  return 7;
}

export function deadlineFromNow(level: number) {
  return new Date(Date.now() + deadlineDaysForLevel(level) * 86_400_000).toISOString();
}

/** Only verified public email addresses are eligible for routing. */
export function findAuthority(departmentId: number, district: string | null, level: number, institution = ''): Authority | undefined {
  const d = (district ?? '').trim();
  const i = institution.trim();
  return get<Authority>(
    `SELECT * FROM department_authorities
      WHERE department_id = ? AND level = ? AND active = 1 AND verified = 1
        AND (LOWER(TRIM(district)) = LOWER(TRIM(?)) OR district = '')
        AND (LOWER(TRIM(institution)) = LOWER(TRIM(?)) OR institution = '')
      ORDER BY CASE WHEN LOWER(TRIM(institution)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END, CASE WHEN LOWER(TRIM(district)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END LIMIT 1`,
    departmentId, level, d, i, i, d,
  );
}

export async function emailAuthorityForComplaint(complaintId: number, level: number, reason: string) {
  const c = get<{
    ref: string; title: string; body_original: string; body_english: string | null;
    user_name: string; district: string | null; institution_input: string; department_name: string; department_id: number;
  }>(
    `SELECT c.ref, c.title, c.body_original, c.body_english, u.name AS user_name,
            COALESCE(c.district, c.district_input) AS district, c.institution_input, d.name AS department_name, c.department_id
       FROM complaints c JOIN users u ON u.id = c.user_id
       JOIN departments d ON d.id = c.department_id WHERE c.id = ?`, complaintId,
  );
  if (!c) return false;
  const authority = findAuthority(c.department_id, c.district, level, c.institution_input);
  if (!authority) return false;
  const history = all<{ type: string; message: string; created_at: string }>("SELECT type, message, created_at FROM complaint_events WHERE complaint_id = ? AND visibility = 'public' ORDER BY id", complaintId)
    .map((e) => `${e.created_at} — ${e.type}: ${e.message}`).join('\n');
  const attachments = all<{ filename: string }>('SELECT filename FROM attachments WHERE complaint_id = ? ORDER BY id', complaintId).map((a) => a.filename);
  const { sendAuthorityComplaintEmail } = await import('./email.js');
  const accepted = await sendAuthorityComplaintEmail({
    complaintId, ref: c.ref, title: c.title, body: c.body_english || c.body_original,
    citizenName: c.user_name, district: c.district, institution: c.institution_input, departmentName: c.department_name,
    level, authorityName: authority.authority_name, designation: authority.designation,
    email: authority.email, reason, history, attachments,
  });
  if (!accepted) return false;
  run('UPDATE complaints SET current_authority_id = ?, escalation_level = ?, assigned_at = ?, sla_due_at = ?, updated_at = ? WHERE id = ?',
    authority.id, level, nowIso(), deadlineFromNow(level), nowIso(), complaintId);
  return true;
}

export async function startAuthorityRouting(complaintId: number) {
  run('UPDATE complaints SET updated_at = ? WHERE id = ?', nowIso(), complaintId);
  const c = get<{ department_id: number; district: string | null; ref: string }>('SELECT department_id, district, ref FROM complaints WHERE id = ?', complaintId);
  if (!c?.department_id) return false;
  const ok = await emailAuthorityForComplaint(complaintId, 1, 'New complaint assigned to the responsible department.');
  if (!ok) {
    run('UPDATE complaints SET updated_at = ? WHERE id = ?', nowIso(), complaintId);
    const { notifyRole } = await import('./events.js');
    notifyRole('admin', { complaintId, kind: 'warning', title: `${c.ref} is waiting for authority email routing`, body: 'Level 1 needs a verified public email address, or the Resend email request failed. No authority-level deadline has started until the initial email is accepted.' });
    return false;
  }
  return true;
}
