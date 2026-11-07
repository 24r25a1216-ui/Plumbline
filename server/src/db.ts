import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  domain        TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  head_name     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  sla_hours     INTEGER NOT NULL DEFAULT 72,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('citizen','officer','admin')),
  department_id   INTEGER REFERENCES departments(id),
  phone           TEXT NOT NULL DEFAULT '',
  preferred_lang  TEXT NOT NULL DEFAULT 'en',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  token_version   INTEGER NOT NULL DEFAULT 0,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS complaints (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ref                 TEXT UNIQUE,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  title               TEXT NOT NULL,
  body_original       TEXT NOT NULL,
  language            TEXT,
  body_english        TEXT,
  translation_method  TEXT,
  location_input      TEXT NOT NULL DEFAULT '',
  district_input      TEXT NOT NULL DEFAULT '',
  institution_input   TEXT NOT NULL DEFAULT '',
  pincode             TEXT NOT NULL DEFAULT '',
  incident_date       TEXT,
  domain              TEXT,
  category            TEXT,
  confidence          REAL,
  severity            INTEGER,
  priority            TEXT,
  location_text       TEXT,
  district            TEXT,
  department_id       INTEGER REFERENCES departments(id),
  status              TEXT NOT NULL DEFAULT 'submitted',
  ai_engine           TEXT,
  ai_json             TEXT,
  ai_error            TEXT,
  duplicate_of        INTEGER REFERENCES complaints(id),
  duplicate_score     REAL,
  escalation_level    INTEGER NOT NULL DEFAULT 0,
  escalated_at        TEXT,
  escalation_reason   TEXT,
  sla_due_at          TEXT,
  resolution_note     TEXT,
  reopen_count        INTEGER NOT NULL DEFAULT 0,
  verified_by         INTEGER REFERENCES users(id),
  verified_at         TEXT,
  assigned_at         TEXT,
  resolved_at         TEXT,
  closed_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_complaints_user   ON complaints(user_id);
CREATE INDEX IF NOT EXISTS ix_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS ix_complaints_dept   ON complaints(department_id);
CREATE INDEX IF NOT EXISTS ix_complaints_created ON complaints(created_at);

CREATE TABLE IF NOT EXISTS department_authorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  district TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL CHECK(level >= 1),
  designation TEXT NOT NULL,
  authority_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(department_id, district, institution, level)
);
CREATE INDEX IF NOT EXISTS ix_authorities_lookup ON department_authorities(department_id, district, level, active, verified);

CREATE TABLE IF NOT EXISTS email_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS complaint_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  message       TEXT NOT NULL DEFAULT '',
  meta          TEXT,
  actor_id      INTEGER REFERENCES users(id),
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_events_complaint ON complaint_events(complaint_id);

CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS corrections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  field         TEXT NOT NULL,
  ai_value      TEXT,
  final_value   TEXT,
  source        TEXT NOT NULL DEFAULT 'verification',
  note          TEXT NOT NULL DEFAULT '',
  actor_id      INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  satisfied     INTEGER NOT NULL,
  comment       TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complaint_id  INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'info',
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  read_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS embeddings (
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  model         TEXT NOT NULL,
  vector        TEXT NOT NULL,
  PRIMARY KEY (complaint_id, model)
);

CREATE TABLE IF NOT EXISTS model_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  examples      INTEGER NOT NULL,
  vocabulary    INTEGER NOT NULL,
  accuracy      REAL,
  trigger       TEXT NOT NULL,
  actor_id      INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id      INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,
  target        TEXT NOT NULL DEFAULT '',
  meta          TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

type Param = string | number | bigint | null | Uint8Array;
type In = Param | boolean | undefined;

const cache = new Map<string, StatementSync>();
function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}
const norm = (p: In[]): Param[] =>
  p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function get<T = any>(sql: string, ...params: In[]): T | undefined {
  return stmt(sql).get(...norm(params)) as T | undefined;
}
export function all<T = any>(sql: string, ...params: In[]): T[] {
  return stmt(sql).all(...norm(params)) as T[];
}
export function run(sql: string, ...params: In[]) {
  const r = stmt(sql).run(...norm(params));
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}
// Migration: add officer assignment to existing complaint databases.
const complaintColumns = db.prepare('PRAGMA table_info(complaints)').all() as { name: string }[];

if (!complaintColumns.some((column) => column.name === 'assigned_to')) {
  db.exec('ALTER TABLE complaints ADD COLUMN assigned_to INTEGER REFERENCES users(id)');
}
if (!complaintColumns.some((column) => column.name === 'current_authority_id')) {
  db.exec('ALTER TABLE complaints ADD COLUMN current_authority_id INTEGER REFERENCES department_authorities(id)');
}
if (!complaintColumns.some((column) => column.name === 'institution_input')) {
  db.exec("ALTER TABLE complaints ADD COLUMN institution_input TEXT NOT NULL DEFAULT ''");
}
export const nowIso = () => new Date().toISOString();
export const json = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function audit(actorId: number | null, action: string, target = '', meta?: unknown) {
  run(
    'INSERT INTO audit_log (actor_id, action, target, meta) VALUES (?,?,?,?)',
    actorId,
    action,
    target,
    meta === undefined ? null : JSON.stringify(meta),
  );
}

