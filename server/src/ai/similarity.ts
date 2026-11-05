/**
 * FR16 duplicate / similar complaint detection and FR17 historical search.
 * Uses OpenAI embeddings when available, TF-IDF cosine otherwise.
 */
import { all, run } from '../db.js';
import { features } from './preprocess.js';
import { aiActive, getSettings } from '../settings.js';
import { embed } from './openai.js';

interface Row {
  id: number; ref: string; user_id: number; title: string; body_original: string; body_english: string | null;
  status: string; domain: string | null; category: string | null; district: string | null; location_text: string | null; created_at: string;
  resolution_note: string | null; resolved_at: string | null; rating: number | null;
}

export interface Match {
  id: number; ref: string; title: string; status: string; domain: string | null; category: string | null; district: string | null;
  similarity: number; sameUser: boolean; createdAt: string; resolutionNote: string | null; resolvedInDays: number | null; rating: number | null;
  reason?: string;
}

export interface SimilarityResult {
  engine: string;
  duplicates: Match[];
  similar: Match[];
  history: Match[];
  thresholds: { duplicate: number; similar: number };
  corpusSize: number;
}

const featCache = new Map<number, { key: string; tf: Map<string, number> }>();

function tfOf(id: number, text: string) {
  const c = featCache.get(id);
  if (c && c.key === text) return c.tf;
  const tf = new Map<string, number>();
  for (const f of features(text)) tf.set(f, (tf.get(f) ?? 0) + 1);
  featCache.set(id, { key: text, tf });
  return tf;
}

const textOf = (r: { title: string; body_english: string | null; body_original: string }) => `${r.title}. ${r.body_english || r.body_original}`;

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function tfidfScores(query: string, rows: Row[]): Map<number, number> {
  const docs = rows.map((r) => ({ id: r.id, tf: tfOf(r.id, textOf(r)) }));
  const qtf = new Map<string, number>();
  for (const f of features(query)) qtf.set(f, (qtf.get(f) ?? 0) + 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const k of d.tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const N = docs.length + 1;
  const idf = (k: string) => Math.log((N + 1) / ((df.get(k) ?? 0) + 1)) + 1;
  const vec = (tf: Map<string, number>) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [k, n] of tf) { const w = (1 + Math.log(n)) * idf(k); v.set(k, w); norm += w * w; }
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  const q = vec(qtf);
  const out = new Map<number, number>();
  for (const d of docs) {
    const dv = vec(d.tf);
    let dot = 0;
    for (const [k, w] of q.v) { const o = dv.v.get(k); if (o) dot += w * o; }
    out.set(d.id, dot / (q.norm * dv.norm));
  }
  return out;
}

async function embeddingScores(selfId: number | null, query: string, rows: Row[]): Promise<Map<number, number>> {
  const model = getSettings().openai_embed_model;
  const have = new Map<number, number[]>();
  for (const e of all<{ complaint_id: number; vector: string }>('SELECT complaint_id, vector FROM embeddings WHERE model = ?', model)) {
    have.set(e.complaint_id, JSON.parse(e.vector));
  }
  const missing = rows.filter((r) => !have.has(r.id)).slice(0, 256);
  if (missing.length) {
    const vecs = await embed(missing.map(textOf));
    missing.forEach((r, i) => {
      have.set(r.id, vecs[i]);
      run('INSERT OR REPLACE INTO embeddings (complaint_id, model, vector) VALUES (?,?,?)', r.id, model, JSON.stringify(vecs[i]));
    });
  }
  let qv = selfId != null ? have.get(selfId) : undefined;
  if (!qv) {
    [qv] = await embed([query]);
    if (selfId != null) run('INSERT OR REPLACE INTO embeddings (complaint_id, model, vector) VALUES (?,?,?)', selfId, model, JSON.stringify(qv));
  }
  const out = new Map<number, number>();
  for (const r of rows) { const v = have.get(r.id); if (v) out.set(r.id, cosine(qv!, v)); }
  return out;
}

export async function findSimilar(input: {
  selfId: number | null; userId: number | null; text: string; category?: string | null; district?: string | null; locality?: string | null; forceLocal?: boolean;
}): Promise<SimilarityResult & { fallbackReason?: string }> {
  const rows = all<Row>(
    `SELECT c.id, c.ref, c.user_id, c.title, c.body_original, c.body_english, c.status, c.domain, c.category, c.district, c.location_text,
            c.created_at, c.resolution_note, c.resolved_at, (SELECT rating FROM feedback f WHERE f.complaint_id = c.id ORDER BY f.id DESC LIMIT 1) AS rating
       FROM complaints c
      WHERE c.id != ? AND c.status NOT IN ('withdrawn')
      ORDER BY c.id DESC LIMIT 1500`,
    input.selfId ?? -1,
  );

  const s = getSettings();
  let engine = 'tfidf';
  let scores: Map<number, number>;
  let fallbackReason: string | undefined;
  let dupT = Math.round(s.duplicate_threshold * 0.62 * 100) / 100;
  let simT = Math.round(s.similar_threshold * 0.55 * 100) / 100;

  if (!input.forceLocal && aiActive()) {
    try {
      scores = await embeddingScores(input.selfId, input.text, rows);
      engine = `embedding:${s.openai_embed_model}`;
      dupT = s.duplicate_threshold;
      simT = s.similar_threshold;
    } catch (e: any) {
      fallbackReason = e.message;
      scores = tfidfScores(input.text, rows);
    }
  } else {
    scores = tfidfScores(input.text, rows);
  }

  const now = Date.now();
  const toMatch = (r: Row, sim: number): Match => ({
    id: r.id, ref: r.ref, title: r.title, status: r.status, domain: r.domain, category: r.category, district: r.district,
    similarity: Math.round(sim * 1000) / 1000, sameUser: input.userId != null && r.user_id === input.userId, createdAt: r.created_at,
    resolutionNote: r.resolution_note, rating: r.rating,
    resolvedInDays: r.resolved_at ? Math.max(0.1, Math.round(((Date.parse(r.resolved_at) - Date.parse(r.created_at)) / 86_400_000) * 10) / 10) : null,
  });

  const scored = rows
    .map((r) => {
      let sim = scores.get(r.id) ?? 0;
      // Contextual boost: the same issue in the same place is far more likely a duplicate.
      if (input.district && r.district === input.district) sim += 0.04;
      if (input.category && r.category === input.category) sim += 0.04;
      return { r, sim: Math.min(1, sim), raw: scores.get(r.id) ?? 0 };
    })
    .filter((x) => x.sim >= simT)
    .sort((a, b) => b.sim - a.sim);

  const openish = new Set(['submitted', 'analyzing', 'awaiting_verification', 'assigned', 'in_progress', 'on_hold', 'reopened']);
  const recent = (r: Row) => now - Date.parse(r.created_at) < 90 * 86_400_000;

  // Contextual duplicate: same kind of problem, same place, same month — even when worded differently.
  const loc = (input.locality ?? '').toLowerCase().trim();
  const sameLocality = (r: Row) => !!loc && !!r.location_text && (r.location_text.toLowerCase().includes(loc) || loc.includes(r.location_text.toLowerCase()));
  const contextual = (x: { r: Row; raw: number }) =>
    !!input.category && x.r.category === input.category && !!input.district && x.r.district === input.district &&
    now - Date.parse(x.r.created_at) < 30 * 86_400_000 && (sameLocality(x.r) || x.raw >= dupT * 0.7);
  const duplicates = scored
    .filter((x) => (openish.has(x.r.status) || x.r.status === 'resolved') && recent(x.r) && (x.sim >= dupT || contextual(x)))
    .slice(0, 5)
    .map((x) => ({ ...toMatch(x.r, x.sim), reason: x.sim >= dupT ? 'High text similarity' : 'Same issue type, same locality, within 30 days' }));
  const dupIds = new Set(duplicates.map((d) => d.id));
  const similar = scored.filter((x) => !dupIds.has(x.r.id) && openish.has(x.r.status)).slice(0, 5).map((x) => toMatch(x.r, x.sim));
  const history = scored.filter((x) => ['resolved', 'closed'].includes(x.r.status) && x.r.resolution_note).slice(0, 5).map((x) => toMatch(x.r, x.sim));

  return { engine, duplicates, similar, history, thresholds: { duplicate: dupT, similar: simT }, corpusSize: rows.length, fallbackReason };
}

export function forgetEmbedding(id: number) {
  featCache.delete(id);
  run('DELETE FROM embeddings WHERE complaint_id = ?', id);
}

