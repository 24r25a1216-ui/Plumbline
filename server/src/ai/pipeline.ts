/**
 * The analysis pipeline. Runs every stage from FR5 to FR18 in order,
 * streams progress over SSE, and degrades gracefully: any OpenAI stage
 * that fails falls back to the local engine and is marked as such in the trace.
 */
import { get, run, nowIso } from '../db.js';
import { aiActive, getSettings, slaHoursFor } from '../settings.js';
import { publishComplaint, notify, notifyRole } from '../events.js';
import { addEvent, changeStatus, escalate } from '../services.js';
import { detectLanguage, glossaryTranslate, LANG_LABEL, type LanguageResult, type Lang } from './language.js';
import { preprocess, type Preprocessed } from './preprocess.js';
import { classifyLocal, type LocalClassification } from './classifier.js';
import { contextSignals, localSeverity, computePriority, locate, type ContextSignals, type SeverityResult, type PriorityResult, type LocationResult } from './assess.js';
import { findSimilar, type SimilarityResult } from './similarity.js';
import { llmTranslate, llmAnalyze, llmRecommend, type LLMAnalysis } from './llm.js';
import { categoryByKey, categoryLabel, DISTRICTS, SEVERITY_LABELS, type DomainKey } from './taxonomy.js';

export type Engine = 'openai' | 'local' | 'rules';

export interface StageTrace {
  key: string;
  label: string;
  fr: string;
  status: 'done' | 'fallback' | 'failed' | 'skipped';
  engine: Engine;
  ms: number;
  summary: string;
  note?: string;
}

export interface Analysis {
  version: 2;
  engine: 'openai' | 'local' | 'hybrid';
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  language: LanguageResult & { aiConfirmed?: boolean };
  translation: { text: string; title: string; method: 'none' | 'openai' | 'glossary'; coverage: number | null; notes: string };
  preprocess: Omit<Preprocessed, 'tokens'> & { tokens: string[] };
  classification: {
    domain: DomainKey; category: string; confidence: number; rationale: string; evidence: string[];
    alternatives: { domain: string; category: string; confidence: number }[];
    local: LocalClassification; llm: { domain: string; category: string; confidence: number } | null; agreement: 'full' | 'domain' | 'none' | 'n/a';
  };
  confidence: { score: number; level: 'high' | 'medium' | 'low'; needsReview: boolean; signals: { label: string; value: string; effect: number }[] };
  context: ContextSignals & { scope: string; sentiment: string | null; actionable: boolean; mixed: boolean };
  severity: SeverityResult & { source: Engine };
  priority: PriorityResult;
  location: LocationResult;
  routing: { departmentId: number | null; departmentCode: string; departmentName: string; office: string; slaHours: number; reasons: string[] };
  similarity: SimilarityResult & { fallbackReason?: string };
  recommendation: { actions: string[]; expectedDays: number; rationale: string; referenced: string[]; citizenMessage: string; source: Engine };
  summary: string;
  trace: StageTrace[];
}

interface ComplaintRow {
  id: number; ref: string; user_id: number; title: string; body_original: string;
  location_input: string; district_input: string; pincode: string; reopen_count: number;
}

const running = new Set<number>();

export function isAnalyzing(id: number) {
  return running.has(id);
}

export interface PipelineOptions { actorId?: number | null; rerun?: boolean; forceLocal?: boolean; quiet?: boolean }

export async function analyzeComplaint(id: number, opts: PipelineOptions = {}) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await runPipeline(id, opts);
  } finally {
    running.delete(id);
  }
}

async function runPipeline(id: number, opts: PipelineOptions) {
  const c = get<ComplaintRow>('SELECT id, ref, user_id, title, body_original, location_input, district_input, pincode, reopen_count FROM complaints WHERE id = ?', id);
  if (!c) return;

  changeStatus(id, 'analyzing', { force: true, message: opts.rerun ? 'Re-analysis requested by reviewer' : 'Automated analysis started', visibility: opts.rerun ? 'internal' : 'public', actorId: opts.actorId });

  const useAI = !opts.forceLocal && aiActive();
  const trace: StageTrace[] = [];
  const started = Date.now();
  let usedOpenAI = false;
  let usedFallback = false;

  async function stage<T>(key: string, label: string, fr: string, fn: () => Promise<{ value: T; engine: Engine; summary: string; status?: StageTrace['status']; note?: string }>): Promise<T> {
    publishComplaint(id, 'analysis.stage', { stage: key, label, fr, state: 'running' });
    const t0 = Date.now();
    const r = await fn();
    const tr: StageTrace = { key, label, fr, status: r.status ?? 'done', engine: r.engine, ms: Date.now() - t0, summary: r.summary, note: r.note };
    if (r.engine === 'openai') usedOpenAI = true;
    if (tr.status === 'fallback') usedFallback = true;
    trace.push(tr);
    publishComplaint(id, 'analysis.stage', { stage: key, label, fr, state: tr.status, engine: tr.engine, ms: tr.ms, summary: tr.summary });
    return r.value;
  }

  try {
    const raw = `${c.title}. ${c.body_original}`;

    /* FR5 + FR6 — language & translation */
    const language = await stage('language', 'Language detection', 'FR5', async () => {
      const l = detectLanguage(raw);
      return { value: l as Analysis['language'], engine: 'rules', summary: `${l.label}${l.romanized ? ' (romanised)' : ''} · ${(l.confidence * 100).toFixed(0)}% via ${l.method}` };
    });

    const translation = await stage<Analysis['translation']>('translation', 'Translation to English', 'FR6', async () => {
      const needs = language.code !== 'en' || language.script === 'mixed';
      const none = { text: c.body_original, title: c.title, method: 'none' as const, coverage: null, notes: '' };
      const glossary = (notes: string) => {
        const b = glossaryTranslate(c.body_original);
        const t = glossaryTranslate(c.title);
        return { text: b.text, title: t.text, method: 'glossary' as const, coverage: Math.round(((b.coverage * 3 + t.coverage) / 4) * 100) / 100, notes };
      };
      if (useAI && (needs || language.confidence < 0.8)) {
        try {
          const r = await llmTranslate(c.title, c.body_original);
          if (r.data.language !== 'other' && r.data.language !== language.code) {
            Object.assign(language, { code: r.data.language as Lang, label: LANG_LABEL[r.data.language as Lang], method: 'openai', confidence: Math.round(r.data.confidence * 100) / 100, romanized: r.data.romanized });
          }
          language.aiConfirmed = true;
          if (r.data.language === 'en') return { value: none, engine: 'openai' as Engine, summary: 'Already English (confirmed by model)', status: 'skipped' as const };
          return { value: { text: r.data.translation, title: r.data.title_translation, method: 'openai' as const, coverage: 1, notes: r.data.notes }, engine: 'openai' as Engine, summary: `${language.label} → English · neural translation` };
        } catch (e: any) {
          if (!needs) return { value: none, engine: 'rules' as Engine, summary: 'English — no translation needed', status: 'skipped' as const, note: e.message };
          const g = glossary('Approximate glossary translation (OpenAI unavailable).');
          return { value: g, engine: 'local' as Engine, summary: `Glossary translation · ${(g.coverage * 100).toFixed(0)}% coverage`, status: 'fallback' as const, note: e.message };
        }
      }
      if (!needs) return { value: none, engine: 'rules' as Engine, summary: 'English — no translation needed', status: 'skipped' as const };
      const g = glossary('Approximate glossary translation — connect OpenAI for full neural translation.');
      return { value: g, engine: 'local' as Engine, summary: `Glossary translation · ${(g.coverage * 100).toFixed(0)}% coverage` };
    });

    // Analysis runs on English + original (so native-script keywords still count locally).
    const english = translation.text;
    const englishFull = `${translation.title}. ${english}`;
    const analysisText = translation.method === 'none' ? englishFull : `${englishFull}
${raw}`;

    /* FR7 — preprocessing */
    const pre = await stage('preprocess', 'Text preprocessing', 'FR7', async () => {
      const p = preprocess(englishFull);
      return { value: p, engine: 'rules', summary: `${p.stats.tokens} tokens → ${p.stats.terms} terms · ${p.stats.stopwordsRemoved} stop-words removed${p.stats.piiMasked ? ` · ${p.stats.piiMasked} PII masked` : ''}` };
    });

    /* FR8 + FR9 + FR10 — classification + confidence */
    let llm: LLMAnalysis | null = null;
    const local = classifyLocal(analysisText);
    const classification = await stage('classification', 'Domain & category classification', 'FR8 · FR9', async () => {
      if (useAI) {
        try {
          const r = await llmAnalyze({ title: translation.title, english, locationInput: c.location_input, districtInput: c.district_input });
          llm = r.data;
          const cat = categoryByKey.get(llm.category);
          const domain = (cat?.domain ?? llm.domain) as DomainKey;
          const agreement = local.category === llm.category ? 'full' : local.domain === domain ? 'domain' : 'none';
          return {
            value: { domain, category: llm.category, confidence: clamp01(llm.confidence), rationale: llm.rationale, evidence: llm.evidence_phrases.slice(0, 8), alternatives: llm.alternatives.slice(0, 3), local, llm: { domain, category: llm.category, confidence: llm.confidence }, agreement } as Analysis['classification'],
            engine: 'openai' as Engine,
            summary: `${cat?.label ?? llm.category} · local model ${agreement === 'full' ? 'agrees' : agreement === 'domain' ? 'agrees on domain' : 'disagrees'}`,
          };
        } catch (e: any) {
          return { value: localClassification(local), engine: 'local' as Engine, summary: `${categoryLabel(local.category)} (Naive Bayes)`, status: 'fallback' as const, note: e.message };
        }
      }
      return { value: localClassification(local), engine: 'local' as Engine, summary: `${categoryLabel(local.category)} · p=${local.confidence}` };
    });

    const confidence = await stage('confidence', 'Context & confidence analysis', 'FR10', async () => {
      const r = confidenceAnalysis(classification, pre, translation, llm);
      return { value: r, engine: 'rules', summary: `${(r.score * 100).toFixed(0)}% · ${r.level}${r.needsReview ? ' · flagged for careful review' : ''}` };
    });

    /* FR11 + FR13 — severity, location */
    const signals = contextSignals(analysisText);
    const ctx: Analysis['context'] = { ...signals, scope: 'individual', sentiment: null, actionable: true, mixed: false };
    if (llm) {
      const L = llm as LLMAnalysis;
      ctx.scope = L.context.affected_scope;
      ctx.sentiment = L.context.sentiment;
      ctx.actionable = L.context.is_actionable;
      ctx.mixed = L.context.mixed_issues;
      if (L.context.safety_risk && !ctx.lifeSafety.length) ctx.lifeSafety.push('safety risk (AI)');
      for (const v of L.context.vulnerable_groups) if (!ctx.vulnerable.includes(v)) ctx.vulnerable.push(v);
      if ((L.context.affected_scope === 'community' || L.context.affected_scope === 'large_population') && !ctx.scale.length) ctx.scale.push(L.context.affected_scope.replace('_', ' '));
      if (L.context.essential_service_disrupted && !ctx.essential.length) ctx.essential.push('essential service (AI)');
      if (ctx.durationDays == null && L.context.duration_days != null) ctx.durationDays = L.context.duration_days;
    } else {
      ctx.scope = signals.scale.length ? 'community' : 'individual';
    }

    const severity = await stage('severity', 'Severity assessment', 'FR11', async () => {
      const loc = localSeverity(classification.category, ctx);
      if (llm) {
        const L = llm as LLMAnalysis;
        let level = L.severity.level;
        const factors = L.severity.factors.map((f) => ({ label: f, weight: 0 }));
        // Hard safety floor: never let the model under-rate explicit life-safety signals.
        if (signals.lifeSafety.length && level < 4) {
          level = 4;
          factors.push({ label: `Safety floor applied (${signals.lifeSafety.slice(0, 2).join(', ')})`, weight: 0 });
        }
        return { value: { level, label: SEVERITY_LABELS[level], factors, justification: L.severity.justification, source: 'openai' as Engine }, engine: 'openai' as Engine, summary: `${level} · ${SEVERITY_LABELS[level]}` };
      }
      return { value: { ...loc, source: 'local' as Engine }, engine: 'local' as Engine, summary: `${loc.level} · ${loc.label} (${loc.factors.length} factors)` };
    });

    const location = await stage('location', 'Location identification', 'FR13', async () => {
      const g = locate({ text: analysisText, locationInput: c.location_input, districtInput: c.district_input, pincode: c.pincode });
      // The citizen's own district always wins; a typed locality without a district should not block the model's inference.
      if (llm && !(g.source === 'user' && g.district)) {
        const L = (llm as LLMAnalysis).location;
        const d = DISTRICTS.find((x) => x.name === L.district);
        if (d && (!g.district || L.confidence > g.confidence)) {
          return { value: { ...g, text: L.text || g.text, locality: L.locality || g.locality, district: d.name, state: d.state, source: 'ai' as const, confidence: clamp01(L.confidence) }, engine: 'openai' as Engine, summary: `${L.locality || L.text} · ${d.name}` };
        }
      }
      return { value: g, engine: 'rules' as Engine, summary: g.district ? `${g.locality ?? g.text} · ${g.district} (${g.source})` : g.text ? `${g.text} (unmatched)` : 'No location found' };
    });

    /* FR16 + FR17 — duplicates & history */
    const similarity = await stage('similarity', 'Duplicate & historical search', 'FR16 · FR17', async () => {
      const r = await findSimilar({ selfId: id, userId: c.user_id, text: englishFull, category: classification.category, district: location.district, locality: location.locality ?? location.text, forceLocal: !useAI });
      const engine: Engine = r.engine.startsWith('embedding') ? 'openai' : 'local';
      return {
        value: r,
        engine,
        status: r.fallbackReason ? 'fallback' : 'done',
        note: r.fallbackReason,
        summary: `${r.duplicates.length} possible duplicate${r.duplicates.length === 1 ? '' : 's'} · ${r.similar.length} related open · ${r.history.length} resolved precedents`,
      };
    });

    /* FR12 — priority */
    const priority = await stage('priority', 'Priority assignment', 'FR12', async () => {
      const nearby = similarity.duplicates.length + similarity.similar.filter((s) => s.district && s.district === location.district).length;
      const p = computePriority({ severity: severity.level, signals: ctx, duplicateCount: nearby, reopened: c.reopen_count > 0 });
      return { value: p, engine: 'rules', summary: `${p.priority} · score ${p.score}/100` };
    });

    /* FR14 — department */
    const routing = await stage('routing', 'Department identification', 'FR14', async () => {
      const cat = categoryByKey.get(classification.category)!;
      const dept = get<{ id: number; code: string; name: string; sla_hours: number }>('SELECT id, code, name, sla_hours FROM departments WHERE code = ? AND active = 1', cat.dept);
      const sla = slaHoursFor(priority.priority);
      const office = `${dept?.name ?? cat.dept} · ${location.district ?? 'State headquarters'}`;
      const reasons = [
        `Category “${cat.label}” is owned by ${dept?.code ?? cat.dept}`,
        location.district ? `Jurisdiction: ${location.district} division` : 'No district identified — routed to state headquarters',
        `${priority.priority} service level: ${sla}h`,
      ];
      return { value: { departmentId: dept?.id ?? null, departmentCode: dept?.code ?? cat.dept, departmentName: dept?.name ?? cat.dept, office, slaHours: sla, reasons }, engine: 'rules', summary: `${dept?.code ?? cat.dept} · ${location.district ?? 'HQ'} · SLA ${sla}h` };
    });

    /* FR18 — recommendation */
    const recommendation = await stage('recommendation', 'Resolution recommendation', 'FR18', async () => {
      const cat = categoryByKey.get(classification.category)!;
      const summary = (llm as LLMAnalysis | null)?.summary ?? `${cat.label} reported${location.district ? ` in ${location.district}` : ''}.`;
      const local = localRecommendation(cat.playbook, similarity, routing.slaHours, routing.departmentName);
      if (useAI) {
        try {
          const r = await llmRecommend({ summary, category: cat.key, categoryLabel: cat.label, department: routing.departmentName, priority: priority.priority, playbook: cat.playbook, history: similarity.history });
          return {
            value: { actions: r.data.actions, expectedDays: Math.max(0.5, r.data.expected_resolution_days), rationale: r.data.rationale, referenced: r.data.referenced_cases, citizenMessage: r.data.citizen_message, source: 'openai' as Engine },
            engine: 'openai' as Engine,
            summary: `${r.data.actions.length} actions · ~${r.data.expected_resolution_days} days · cites ${r.data.referenced_cases.length} case(s)`,
          };
        } catch (e: any) {
          return { value: local, engine: 'local' as Engine, status: 'fallback' as const, note: e.message, summary: `${local.actions.length} playbook actions · ~${local.expectedDays} days` };
        }
      }
      return { value: local, engine: 'local' as Engine, summary: `${local.actions.length} playbook actions · ~${local.expectedDays} days` };
    });

    const finished = Date.now();
    const analysis: Analysis = {
      version: 2,
      engine: usedOpenAI ? (usedFallback ? 'hybrid' : 'openai') : 'local',
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      totalMs: finished - started,
      language,
      translation,
      preprocess: { ...pre, tokens: pre.tokens.slice(0, 160), terms: pre.terms.slice(0, 160), bigrams: pre.bigrams.slice(0, 60) },
      classification,
      confidence,
      context: ctx,
      severity,
      priority,
      location,
      routing,
      similarity,
      recommendation,
      summary: (llm as LLMAnalysis | null)?.summary ?? `${categoryLabel(classification.category)} · ${location.district ?? 'location unknown'} · severity ${severity.level}/5`,
      trace,
    };

    run(
      `UPDATE complaints SET language = ?, body_english = ?, translation_method = ?, domain = ?, category = ?, confidence = ?, severity = ?, priority = ?,
              location_text = ?, district = ?, department_id = ?, ai_engine = ?, ai_json = ?, ai_error = NULL, duplicate_score = ?, updated_at = ? WHERE id = ?`,
      language.code, english, translation.method, classification.domain, classification.category, confidence.score, severity.level, priority.priority,
      location.text || location.locality || '', location.district, routing.departmentId, analysis.engine, JSON.stringify(analysis),
      similarity.duplicates[0]?.similarity ?? null, nowIso(), id,
    );
    addEvent(id, { type: 'ai', message: `Analysis complete in ${(analysis.totalMs / 1000).toFixed(1)}s (${analysis.engine} engine). Suggested: ${categoryLabel(classification.category)} → ${routing.departmentCode}, ${priority.priority}.`, visibility: 'internal', meta: { engine: analysis.engine } });
    // Automatically assign an active officer from the responsible department.
const officer = routing.departmentId
  ? get<{ id: number; name: string; email: string }>(
      `SELECT id, name, email
       FROM users
       WHERE role = 'officer'
         AND status = 'active'
         AND department_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      routing.departmentId,
    )
  : undefined;

if (officer) {
  const now = nowIso();
  const due = new Date(
    Date.now() + slaHoursFor(priority.priority) * 3_600_000,
  ).toISOString();

  run(
    `UPDATE complaints
     SET assigned_to = ?,
         verified_at = ?,
         assigned_at = ?,
         sla_due_at = ?
     WHERE id = ?`,
    officer.id,
    now,
    now,
    due,
    id,
  );

  addEvent(id, {
    type: 'assignment',
    message: `Automatically verified and assigned to ${officer.name} (${routing.departmentName}).`,
    visibility: 'internal',
  });

  changeStatus(id, 'assigned', {
    force: true,
    message: `AI analysis completed. Automatically assigned to ${officer.name} in ${routing.departmentName}.`,
  });

  if (!opts.quiet) {
    notify(officer.id, {
      complaintId: id,
      kind: priority.priority === 'P1' ? 'urgent' : 'assignment',
      title: `New complaint assigned: ${c.ref}`,
      body: `${c.title} · ${routing.departmentName} · ${priority.priority}`,
    });
  }

  console.log(`[pipeline] ${c.ref} automatically assigned to ${officer.name}`);
} else {
  changeStatus(id, 'awaiting_verification', {
    force: true,
    message: 'Analysis complete, but no active officer is available in the responsible department. Admin review required.',
  });

  if (!opts.quiet) {
    notifyRole('admin', {
      complaintId: id,
      kind: priority.priority === 'P1' ? 'urgent' : 'review',
      title: `${c.ref} needs manual assignment`,
      body: `No active officer found in ${routing.departmentName}. ${priority.priority} priority.`,
    });
  }
}
// Notify admins whenever AI analysis is completed.
if (!opts.quiet) notifyRole('admin', {
  complaintId: id,
  kind: priority.priority === 'P1' ? 'urgent' : 'review',
  title: `${priority.priority === 'P1' ? 'URGENT · ' : ''}${c.ref} awaiting verification`,
  body: `${categoryLabel(classification.category)} · ${location.district ?? 'Unknown location'} · ${priority.priority}${similarity.duplicates.length ? ` · ${similarity.duplicates.length} possible duplicate(s)` : ''}`,
});
    // FR23 — high priority complaints escalate immediately.
    if (priority.priority === 'P1' && getSettings().auto_escalate_p1 && !opts.rerun && !opts.quiet) {
      escalate(id, 'Marked high priority (P1) by triage — fast-tracked');
    }
    publishComplaint(id, 'analysis.done', { engine: analysis.engine });
  } catch (e: any) {
    console.error(`[pipeline] ${c.ref} failed:`, e);
    run('UPDATE complaints SET ai_error = ?, updated_at = ? WHERE id = ?', String(e?.message ?? e), nowIso(), id);
    addEvent(id, { type: 'ai', message: `Automated analysis failed: ${e?.message ?? e}. Manual classification required.`, visibility: 'internal' });
    changeStatus(id, 'awaiting_verification', { force: true, message: 'Sent for manual review by an official.' });
    notifyRole('admin', { complaintId: id, kind: 'review', title: `${c.ref} needs manual classification`, body: 'Automated analysis failed.' });
    publishComplaint(id, 'analysis.done', { error: true });
  }
}

function localClassification(local: LocalClassification): Analysis['classification'] {
  return {
    domain: local.domain, category: local.category, confidence: local.confidence,
    rationale: local.evidence.length ? `Strongest indicative terms: ${local.evidence.slice(0, 5).join(', ')}.` : 'Weak lexical evidence — low information complaint.',
    evidence: local.evidence, alternatives: local.alternatives, local, llm: null, agreement: 'n/a',
  };
}

function confidenceAnalysis(cls: Analysis['classification'], pre: Preprocessed, tr: Analysis['translation'], llm: LLMAnalysis | null): Analysis['confidence'] {
  const signals: Analysis['confidence']['signals'] = [];
  let score = cls.confidence;
  signals.push({ label: cls.llm ? 'Model self-reported confidence' : 'Classifier posterior', value: pct(cls.confidence), effect: 0 });

  if (cls.llm) {
    const lp = cls.local.category === cls.category ? cls.local.confidence : (cls.local.alternatives.find((a) => a.category === cls.category)?.confidence ?? 0);
    score = 0.7 * cls.confidence + 0.3 * Math.max(lp, cls.local.domain === cls.domain ? 0.5 : 0);
    const eff = cls.agreement === 'full' ? 0.08 : cls.agreement === 'domain' ? 0 : -0.15;
    score += eff;
    signals.push({ label: 'Cross-engine agreement', value: cls.agreement === 'full' ? 'Both engines agree' : cls.agreement === 'domain' ? 'Same domain, different category' : 'Engines disagree', effect: eff });
  }
  const runner = cls.alternatives[0]?.confidence ?? 0;
  const margin = cls.confidence - runner;
  if (margin < 0.12) {
    score -= 0.08;
    signals.push({ label: 'Margin over runner-up', value: `${pct(margin)} (${categoryLabel(cls.alternatives[0]?.category)})`, effect: -0.08 });
  } else signals.push({ label: 'Margin over runner-up', value: pct(margin), effect: 0 });

  if (pre.stats.terms < 6) {
    score -= 0.12;
    signals.push({ label: 'Text sufficiency', value: `Only ${pre.stats.terms} content terms`, effect: -0.12 });
  } else signals.push({ label: 'Text sufficiency', value: `${pre.stats.terms} content terms`, effect: 0 });

  if (!cls.llm && cls.local.coverage < 0.2) {
    score -= 0.05;
    signals.push({ label: 'Vocabulary coverage', value: pct(cls.local.coverage), effect: -0.05 });
  }
  if (tr.method === 'glossary' && (tr.coverage ?? 0) < 0.6) {
    score -= 0.1;
    signals.push({ label: 'Translation quality', value: `Glossary coverage ${pct(tr.coverage ?? 0)}`, effect: -0.1 });
  }
  if (llm?.context.mixed_issues) {
    score -= 0.08;
    signals.push({ label: 'Multiple issues in one complaint', value: 'Yes', effect: -0.08 });
  }
  if (llm && !llm.context.is_actionable) {
    score -= 0.1;
    signals.push({ label: 'Actionability', value: 'Not clearly actionable', effect: -0.1 });
  }
  score = Math.round(Math.max(0.05, Math.min(0.99, score)) * 1000) / 1000;
  const level = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return { score, level, needsReview: level !== 'high' || cls.agreement === 'none', signals };
}

function localRecommendation(playbook: string[], sim: SimilarityResult, slaHours: number, dept: string): Analysis['recommendation'] {
  const good = sim.history.filter((h) => (h.rating ?? 4) >= 4).slice(0, 2);
  const actions = [...playbook];
  for (const h of good) actions.splice(1, 0, `Reuse precedent ${h.ref}: ${h.resolutionNote}`);
  const days = sim.history.map((h) => h.resolvedInDays).filter((d): d is number => d != null).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : Math.round((slaHours / 24) * 10) / 10;
  return {
    actions: actions.slice(0, 6),
    expectedDays: median,
    rationale: good.length ? `Department playbook, reinforced by ${good.length} well-rated precedent(s) with similar facts.` : 'Department playbook for this category; no strongly similar precedent found.',
    referenced: good.map((h) => h.ref),
    citizenMessage: `Your complaint has been reviewed and routed to the ${dept}. Similar issues are typically resolved in about ${median} day(s). We will keep you updated at every step.`,
    source: 'local',
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;
