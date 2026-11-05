/**
 * Local NLP engine for FR8–FR10: a multinomial Naive Bayes classifier over
 * stemmed unigrams + bigrams. It is trained on the taxonomy lexicon plus
 * every human-verified complaint, so admin corrections (FR25) directly
 * retrain it.
 */
import { CATEGORIES, categoryByKey, type DomainKey } from './taxonomy.js';
import { features } from './preprocess.js';
import { all, run } from '../db.js';

interface Model {
  classes: string[];
  docCount: Record<string, number>;
  termCount: Record<string, Map<string, number>>;
  totalTerms: Record<string, number>;
  vocab: Set<string>;
  examples: number;
  trainedAt: string;
  accuracy: number | null;
}

let model: Model | null = null;

interface Example { label: string; feats: string[]; weight: number }

function lexiconExamples(): Example[] {
  const out: Example[] = [];
  for (const c of CATEGORIES) {
    // The lexicon acts as a strong prior: each keyword is its own mini-document,
    // plus one aggregate doc with the description.
    for (const k of c.keywords) out.push({ label: c.key, feats: features(k), weight: 4 });
    out.push({ label: c.key, feats: features(`${c.label}. ${c.description}`), weight: 2 });
  }
  return out;
}

function verifiedExamples(): Example[] {
  const rows = all<{ category: string; title: string; body_english: string | null; body_original: string }>(
    `SELECT category, title, body_english, body_original FROM complaints
     WHERE verified_at IS NOT NULL AND category IS NOT NULL AND status NOT IN ('rejected','withdrawn')`,
  );
  return rows
    .filter((r) => categoryByKey.has(r.category))
    .map((r) => ({
      label: r.category,
      // Binarised bag: repeated words in one long complaint shouldn't dominate a class.
      feats: [...new Set(features(`${r.title}. ${r.body_english || r.body_original}`))],
      weight: 1,
    }));
}

function fit(examples: Example[]): Model {
  const m: Model = { classes: CATEGORIES.map((c) => c.key), docCount: {}, termCount: {}, totalTerms: {}, vocab: new Set(), examples: examples.length, trainedAt: new Date().toISOString(), accuracy: null };
  for (const c of m.classes) {
    m.docCount[c] = 0;
    m.termCount[c] = new Map();
    m.totalTerms[c] = 0;
  }
  for (const ex of examples) {
    if (!m.termCount[ex.label]) continue;
    m.docCount[ex.label]++;
    for (const f of ex.feats) {
      m.vocab.add(f);
      m.termCount[ex.label].set(f, (m.termCount[ex.label].get(f) ?? 0) + ex.weight);
      m.totalTerms[ex.label] += ex.weight;
    }
  }
  return m;
}

function scoreAll(m: Model, feats: string[]) {
  const V = m.vocab.size || 1;
  const totalDocs = Object.values(m.docCount).reduce((a, b) => a + b, 0) || 1;
  const known = feats.filter((f) => m.vocab.has(f));
  const logs = m.classes.map((c) => {
    // Smoothed prior: flatten so data-rich categories don't dominate.
    let lp = Math.log((m.docCount[c] + 5) / (totalDocs + 5 * m.classes.length));
    const denom = m.totalTerms[c] + V * 0.5;
    for (const f of known) lp += Math.log(((m.termCount[c].get(f) ?? 0) + 0.5) / denom);
    return lp;
  });
  // Temperature scaling keeps NB from being absurdly over-confident.
  const T = Math.max(1.5, Math.sqrt(known.length || 1));
  const max = Math.max(...logs);
  const exps = logs.map((l) => Math.exp((l - max) / T));
  const sum = exps.reduce((a, b) => a + b, 0);
  return { probs: m.classes.map((c, i) => ({ category: c, p: exps[i] / sum })).sort((a, b) => b.p - a.p), known };
}

function evaluate(): number | null {
  const real = verifiedExamples();
  if (real.length < 8) return null;
  // Deterministic 5-fold cross validation on verified complaints only.
  const lex = lexiconExamples();
  let correct = 0;
  for (let k = 0; k < 5; k++) {
    const test = real.filter((_, i) => i % 5 === k);
    const train = lex.concat(real.filter((_, i) => i % 5 !== k));
    const m = fit(train);
    for (const t of test) if (scoreAll(m, t.feats).probs[0].category === t.label) correct++;
  }
  return Math.round((correct / real.length) * 1000) / 1000;
}

export function trainLocalModel(trigger = 'startup', actorId: number | null = null, record = true) {
  const examples = lexiconExamples().concat(verifiedExamples());
  const m = fit(examples);
  m.accuracy = evaluate();
  model = m;
  if (record) run('INSERT INTO model_versions (examples, vocabulary, accuracy, trigger, actor_id) VALUES (?,?,?,?,?)', m.examples, m.vocab.size, m.accuracy, trigger, actorId);
  return { examples: m.examples, vocabulary: m.vocab.size, accuracy: m.accuracy, trainedAt: m.trainedAt };
}

let retrainTimer: NodeJS.Timeout | undefined;
/** FR25 — learn from every human verification. Debounced so a burst of reviews triggers one retrain. */
export function scheduleRetrain(actorId: number | null, delayMs = 4000) {
  clearTimeout(retrainTimer);
  retrainTimer = setTimeout(() => {
    try {
      const r = trainLocalModel('auto · after verification', actorId);
      console.log(`[model] retrained after verification · ${r.examples} examples${r.accuracy != null ? ` · cv ${(r.accuracy * 100).toFixed(1)}%` : ''}`);
    } catch (e) {
      console.error('[model] auto-retrain failed', e);
    }
  }, delayMs);
}

export function modelInfo() {
  if (!model) trainLocalModel();
  return { examples: model!.examples, vocabulary: model!.vocab.size, accuracy: model!.accuracy, trainedAt: model!.trainedAt };
}

export interface LocalClassification {
  domain: DomainKey;
  category: string;
  confidence: number;
  domainConfidence: number;
  alternatives: { domain: DomainKey; category: string; confidence: number }[];
  evidence: string[];
  coverage: number;
}

export function classifyLocal(text: string): LocalClassification {
  if (!model) trainLocalModel();
  const m = model!;
  const feats = features(text);
  const { probs, known } = scoreAll(m, feats);
  const domainP: Record<string, number> = {};
  for (const p of probs) {
    const d = categoryByKey.get(p.category)!.domain;
    domainP[d] = (domainP[d] ?? 0) + p.p;
  }
  const top = probs[0];
  const topDomain = categoryByKey.get(top.category)!.domain;

  // Evidence: features with the strongest likelihood ratio for the winner.
  const V = m.vocab.size || 1;
  const lr = (f: string, c: string) => ((m.termCount[c].get(f) ?? 0) + 0.5) / (m.totalTerms[c] + V * 0.5);
  const evidence = [...new Set(known)]
    .map((f) => {
      const others = m.classes.filter((c) => c !== top.category).reduce((a, c) => a + lr(f, c), 0) / (m.classes.length - 1);
      return { f, score: Math.log(lr(f, top.category) / others) };
    })
    .filter((x) => x.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.f.replace(/_/g, ' '));

  return {
    domain: topDomain,
    category: top.category,
    confidence: round(top.p),
    domainConfidence: round(domainP[topDomain]),
    alternatives: probs.slice(1, 4).map((p) => ({ domain: categoryByKey.get(p.category)!.domain, category: p.category, confidence: round(p.p) })),
    evidence,
    coverage: round(known.length / (feats.length || 1)),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
