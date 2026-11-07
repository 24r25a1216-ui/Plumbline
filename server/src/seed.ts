/**
 * Seeds departments, staff, demo citizens and a realistic history of
 * complaints. Every complaint is analysed by the real local pipeline, then
 * moved through its lifecycle with back-dated, coherent timestamps.
 *   npm run seed            → seed only if the database is empty
 *   npm run reset           → wipe everything and reseed
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, get, run, all } from './db.js';
import { config } from './config.js';
import { hashPassword } from './auth.js';
import { DEPARTMENTS, categoryByKey } from './ai/taxonomy.js';
import { CASES, CITIZENS } from './seed-data.js';
import { makeRef } from './services.js';
import { slaHoursFor } from './settings.js';

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

export async function seedIfEmpty() {
  const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
  if (n > 0) return false;
  await seed();
  return true;
}

function wipe() {
  db.exec(`
    DELETE FROM notifications; DELETE FROM feedback; DELETE FROM corrections; DELETE FROM attachments; DELETE FROM embeddings;
    DELETE FROM complaint_events; DELETE FROM complaints; DELETE FROM model_versions; DELETE FROM audit_log; DELETE FROM users; DELETE FROM departments;
    DELETE FROM sqlite_sequence;
  `);
  for (const f of fs.readdirSync(config.uploadDir)) fs.rmSync(path.join(config.uploadDir, f), { force: true });
}

function ev(cid: number, at: number, type: string, msg: string, o: { from?: string; to?: string; actor?: number | null; internal?: boolean; meta?: unknown } = {}) {
  run(
    'INSERT INTO complaint_events (complaint_id, type, from_status, to_status, message, meta, actor_id, visibility, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    cid, type, o.from ?? null, o.to ?? null, msg, o.meta === undefined ? null : JSON.stringify(o.meta), o.actor ?? null, o.internal ? 'internal' : 'public', iso(at),
  );
}

export async function seed() {
  // The pipeline module pulls in the events hub etc.; import lazily so `--reset` can wipe first.
  const { analyzeComplaint } = await import('./ai/pipeline.js');
  const { trainLocalModel } = await import('./ai/classifier.js');

  console.log('  · seeding departments & accounts');
  const deptIds = new Map<string, number>();
  for (const d of DEPARTMENTS) {
    const { lastId } = run('INSERT INTO departments (code, name, domain, description, head_name, email, sla_hours) VALUES (?,?,?,?,?,?,?)', d.code, d.name, d.domain, d.description, d.head, `${d.code.toLowerCase()}@plumbline.gov.in`, d.sla);
    deptIds.set(d.code, lastId);
  }

  const [adminPw, officerPw, citizenPw] = await Promise.all([hashPassword('Admin@123'), hashPassword('Officer@123'), hashPassword('Citizen@123')]);
  const adminId = run("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,'admin',?)", 'Anitha Krishnan', 'admin@plumbline.gov.in', adminPw, '9000000001').lastId;
  run("INSERT INTO users (name, email, password_hash, role, phone) VALUES (?,?,?,'admin',?)", 'Suresh Varma', 'cell@plumbline.gov.in', adminPw, '9000000002');

  const officerNames = ['K. Srinivas', 'Padma Rani', 'Imran Khan', 'Dr. Meera Rao', 'Dr. Arjun Pillai', 'N. Ramesh', 'Kavitha Reddy', 'Dr. Salim Ahmed', 'B. Narasimha', 'Swathi Menon', 'G. Prakash', 'Rajesh Yadav', 'Usha Kiran', 'T. Mahesh', 'Deepa Joshi'];
  const officerByDept = new Map<number, number>();
  DEPARTMENTS.forEach((d, i) => {
    const id = run("INSERT INTO users (name, email, password_hash, role, department_id, phone) VALUES (?,?,?,'officer',?,?)", officerNames[i] ?? `${d.code} Officer`, `${d.code.toLowerCase()}.officer@plumbline.gov.in`, officerPw, deptIds.get(d.code)!, `90000001${String(i).padStart(2, '0')}`).lastId;
    officerByDept.set(deptIds.get(d.code)!, id);
  });

  const citizenIds = CITIZENS.map((c, i) =>
    run("INSERT INTO users (name, email, password_hash, role, phone, preferred_lang, created_at) VALUES (?,?,?,'citizen',?,?,?)", c.name, c.email, citizenPw, c.phone, c.lang, iso(Date.now() - (80 - i) * 24 * H)).lastId,
  );

  console.log(`  · analysing ${CASES.length} historical complaints with the local NLP engine`);
  const now = Date.now();
  const ordered = [...CASES].sort((a, b) => b.d - a.d);
  for (const [i, c] of ordered.entries()) {
    const created = now - c.d * 24 * H - (i % 7) * 37 * 60_000;
    const uid = citizenIds[c.u];
    const id = run(
      'INSERT INTO complaints (user_id, title, body_original, location_input, district_input, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      uid, c.title, c.body, c.loc, c.district, iso(created), iso(created),
    ).lastId;
    run('UPDATE complaints SET ref = ? WHERE id = ?', makeRef(id, new Date(created)), id);
    ev(id, created, 'status', 'Complaint received.', { to: 'submitted', actor: uid });

    await analyzeComplaint(id, { forceLocal: true, quiet: true });

    // Back-date the events the pipeline just wrote.
    const pipelineEvents = all<{ id: number }>('SELECT id FROM complaint_events WHERE complaint_id = ? AND created_at > ? ORDER BY id', id, iso(created));
    pipelineEvents.forEach((e, k) => run('UPDATE complaint_events SET created_at = ? WHERE id = ?', iso(created + 4000 + k * 1500), e.id));
    let t = created + 15_000;
    run('UPDATE complaints SET updated_at = ? WHERE id = ?', iso(t), id);

    const row = get<{ category: string; domain: string; severity: number; priority: string; department_id: number | null; district: string | null; ref: string }>('SELECT category, domain, severity, priority, department_id, district, ref FROM complaints WHERE id = ?', id)!;

    if (c.o === 'awaiting') continue;

    if (c.o === 'rejected') {
      t += 5 * H;
      run("UPDATE complaints SET status = 'rejected', closed_at = ?, updated_at = ? WHERE id = ?", iso(t), iso(t), id);
      ev(id, t, 'status', c.reject ?? 'Not within scope.', { from: 'awaiting_verification', to: 'rejected', actor: adminId });
      continue;
    }

    // ── Verification (with genuine corrections when the AI disagreed) ──
    const cat = categoryByKey.get(c.cat)!;
    const deptId = deptIds.get(cat.dept)!;
    const deptName = DEPARTMENTS.find((d) => d.code === cat.dept)!.name;
    const priority = row.priority;
    t += (1 + (i % 5) * 1.6) * H;
    const changed: string[] = [];
    if (row.category !== c.cat) {
      run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, 'category', row.category, c.cat, 'verification', c.note ?? '', adminId, iso(t));
      changed.push('category');
    }
    if (row.domain !== cat.domain) {
      run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, 'domain', row.domain, cat.domain, 'verification', '', adminId, iso(t));
      changed.push('domain');
    }
    if (row.department_id !== deptId) {
      const aiDept = DEPARTMENTS.find((d) => deptIds.get(d.code) === row.department_id)?.code ?? null;
      run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, 'department', aiDept, cat.dept, 'verification', '', adminId, iso(t));
      changed.push('department');
    }
    if (row.district !== c.district) {
      run('INSERT INTO corrections (complaint_id, field, ai_value, final_value, source, note, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, 'district', row.district ?? '', c.district, 'verification', '', adminId, iso(t));
      changed.push('district');
    }
    const due = c.overdue ? now - (6 + (i % 3) * 5) * H : t + slaHoursFor(priority) * H;
    run(
      `UPDATE complaints SET status = 'assigned', domain = ?, category = ?, department_id = ?, district = ?, verified_by = ?, verified_at = ?, assigned_at = ?, sla_due_at = ?, updated_at = ? WHERE id = ?`,
      cat.domain, c.cat, deptId, c.district, adminId, iso(t), iso(t), iso(due), iso(t), id,
    );
    ev(id, t, 'correction', changed.length ? `Reviewer adjusted ${changed.join(', ')}.` : 'Reviewer confirmed the AI analysis without changes.', { actor: adminId, internal: true });
    ev(id, t, 'status', `Verified and assigned to ${deptName}.`, { from: 'awaiting_verification', to: 'assigned', actor: adminId });

    trainLocalModel('seed', null, false); // learn from each verification, like production does
    const officer = officerByDept.get(deptId)!;
    if (c.o === 'assigned') {
      if (c.overdue) {
        run('UPDATE complaints SET escalation_level = 1, escalated_at = ?, escalation_reason = ? WHERE id = ?', iso(now - 2 * H), 'Resolution deadline missed', id);
        ev(id, now - 2 * H, 'escalation', 'Escalated to level 1: Resolution deadline missed', { meta: { level: 1 } });
      } else if (priority === 'P1') {
        run('UPDATE complaints SET escalation_level = 1, escalated_at = ?, escalation_reason = ? WHERE id = ?', iso(t), 'Marked high priority (P1) by triage — fast-tracked', id);
        ev(id, t + 1000, 'escalation', 'Escalated to level 1: Marked high priority (P1) by triage — fast-tracked', { meta: { level: 1 } });
      }
      continue;
    }

    t += (3 + (i % 4) * 4) * H;
    run("UPDATE complaints SET status = 'in_progress', updated_at = ? WHERE id = ?", iso(t), id);
    ev(id, t, 'status', 'Field team deployed; work has started on your complaint.', { from: 'assigned', to: 'in_progress', actor: officer });

    if (c.o === 'in_progress') {
      if (c.overdue) {
        run('UPDATE complaints SET escalation_level = 2, escalated_at = ?, escalation_reason = ? WHERE id = ?', iso(now - 3 * H), 'Resolution deadline missed by 30h', id);
        ev(id, now - 30 * H, 'escalation', 'Escalated to level 1: Resolution deadline missed', { meta: { level: 1 } });
        ev(id, now - 3 * H, 'escalation', 'Escalated to level 2: Resolution deadline missed by 30h', { meta: { level: 2 } });
      }
      ev(id, t + 2 * H, 'comment', 'Site inspected. Materials have been requisitioned; we will update you within 48 hours.', { actor: officer });
      continue;
    }
    if (c.o === 'on_hold') {
      t += 20 * H;
      run("UPDATE complaints SET status = 'on_hold', updated_at = ? WHERE id = ?", iso(t), id);
      ev(id, t, 'status', c.hold ?? 'Awaiting materials.', { from: 'in_progress', to: 'on_hold', actor: officer });
      continue;
    }

    // resolved / closed
    const sev = row.severity;
    const span = Math.max(6, (sev >= 4 ? 18 : 40) + (i % 6) * 9) * H;
    const resolvedAt = Math.min(t + span, now - 2 * H);
    run("UPDATE complaints SET status = 'resolved', resolved_at = ?, resolution_note = ?, updated_at = ? WHERE id = ?", iso(resolvedAt), c.res ?? 'Issue resolved.', iso(resolvedAt), id);
    ev(id, resolvedAt, 'status', `Resolved: ${c.res}`, { from: 'in_progress', to: 'resolved', actor: officer });
    if (c.o === 'resolved') continue;

    const fbAt = Math.min(resolvedAt + 20 * H, now - H);
    run('INSERT INTO feedback (complaint_id, user_id, rating, satisfied, comment, created_at) VALUES (?,?,?,?,?,?)', id, uid, c.rating ?? 4, c.satisfied === false ? 0 : 1, c.comment ?? '', iso(fbAt));
    ev(id, fbAt, 'feedback', `Citizen rated the resolution ${c.rating ?? 4}/5${c.comment ? ` — “${c.comment}”` : ''}.`, { actor: uid, meta: { rating: c.rating ?? 4 } });
    run("UPDATE complaints SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?", iso(fbAt), iso(fbAt), id);
    ev(id, fbAt, 'status', c.satisfied === false ? 'Closed with citizen feedback recorded.' : 'Closed — citizen confirmed the resolution.', { from: 'resolved', to: 'closed', actor: uid });
  }

  // Curated notifications for the demo accounts.
  run('DELETE FROM notifications');
  const demo = citizenIds[0];
  const resolvedDemo = get<{ id: number; ref: string }>("SELECT id, ref FROM complaints WHERE user_id = ? AND status = 'resolved' LIMIT 1", demo);
  if (resolvedDemo) run("INSERT INTO notifications (user_id, complaint_id, kind, title, body, created_at) VALUES (?,?,?,?,?,?)", demo, resolvedDemo.id, 'success', `${resolvedDemo.ref} · Marked resolved — please rate the outcome`, 'Trench restored with WMM and BT patch along the 300 m stretch.', iso(now - 3 * H));
  const escDemo = get<{ id: number; ref: string }>('SELECT id, ref FROM complaints WHERE user_id = ? AND escalation_level > 1 LIMIT 1', demo);
  if (escDemo) run("INSERT INTO notifications (user_id, complaint_id, kind, title, body, created_at) VALUES (?,?,?,?,?,?)", demo, escDemo.id, 'escalation', `Your complaint ${escDemo.ref} was escalated`, 'It is now being followed up by the Department head.', iso(now - 2 * H));
  for (const a of all<{ id: number; ref: string; priority: string }>("SELECT id, ref, priority FROM complaints WHERE status = 'awaiting_verification' ORDER BY id DESC LIMIT 4")) {
    for (const adm of all<{ id: number }>("SELECT id FROM users WHERE role = 'admin'")) {
      run("INSERT INTO notifications (user_id, complaint_id, kind, title, body, created_at) VALUES (?,?,?,?,?,?)", adm.id, a.id, a.priority === 'P1' ? 'urgent' : 'review', `${a.priority === 'P1' ? 'URGENT · ' : ''}${a.ref} awaiting verification`, 'New complaint analysed and ready for review.', iso(now - 30 * 60_000));
    }
  }

  trainLocalModel('seed');
  console.log('  · seed complete');
  console.log('\n    Admin    admin@plumbline.gov.in        / Admin@123');
  console.log('    Officer  wsb.officer@plumbline.gov.in  / Officer@123  (any <code>.officer@…)');
  console.log('    Citizen  citizen@plumbline.in          / Citizen@123\n');
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.log('  · wiping database');
    wipe();
    await seed();
  } else if (!(await seedIfEmpty())) {
    console.log('  · database already has data (use `npm run reset` to start over)');
  }
  process.exit(0);
}
