/**
 * OpenAI-backed stages. Each returns structured, schema-validated JSON.
 * Recent admin corrections are injected as few-shot "case law" so the LLM
 * learns from human verification (FR25).
 */
import { chatJSON } from './openai.js';
import { CATEGORIES, DOMAINS, districtNames } from './taxonomy.js';
import { all } from '../db.js';

/* ── FR5 / FR6 ───────────────────────────────────────────────────── */

export interface LLMTranslation { language: 'en' | 'hi' | 'te' | 'other'; romanized: boolean; confidence: number; title_translation: string; translation: string; notes: string }

export async function llmTranslate(title: string, body: string) {
  return chatJSON<LLMTranslation>({
    schemaName: 'translation',
    system:
      'You are a precise translator for an Indian public grievance portal. Detect whether the complaint is in English, Hindi or Telugu ' +
      '(including Hindi/Telugu typed in Latin letters, i.e. romanised). Translate it faithfully into clear English, preserving names, places, ' +
      'numbers, durations and every factual claim. Do not summarise, soften or add information. If it is already English, return it unchanged.',
    user: `TITLE: ${title}

BODY:
${body}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['language', 'romanized', 'confidence', 'title_translation', 'translation', 'notes'],
      properties: {
        language: { type: 'string', enum: ['en', 'hi', 'te', 'other'] },
        romanized: { type: 'boolean' },
        confidence: { type: 'number' },
        title_translation: { type: 'string', description: 'English translation of TITLE.' },
        translation: { type: 'string', description: 'English translation of BODY.' },
        notes: { type: 'string', description: 'Ambiguities or idioms worth flagging to a reviewer; empty if none.' },
      },
    },
  });
}

/* ── FR8–FR13 ───────────────────────────────────────────────────── */

export interface LLMAnalysis {
  domain: string;
  category: string;
  confidence: number;
  rationale: string;
  evidence_phrases: string[];
  alternatives: { domain: string; category: string; confidence: number }[];
  context: {
    affected_scope: 'individual' | 'household' | 'community' | 'large_population';
    vulnerable_groups: string[];
    safety_risk: boolean;
    essential_service_disrupted: boolean;
    duration_days: number | null;
    sentiment: 'calm' | 'frustrated' | 'distressed' | 'urgent';
    is_actionable: boolean;
    mixed_issues: boolean;
  };
  severity: { level: number; justification: string; factors: string[] };
  location: { text: string; locality: string; district: string; state: string; confidence: number };
  summary: string;
}

function correctionMemory(): string {
  const rows = all<{ title: string; body: string; field: string; ai_value: string; final_value: string; note: string }>(
    `SELECT c.title, COALESCE(c.body_english, c.body_original) AS body, k.field, k.ai_value, k.final_value, k.note
       FROM corrections k JOIN complaints c ON c.id = k.complaint_id
      WHERE k.field IN ('category','domain','severity')
      ORDER BY k.id DESC LIMIT 8`,
  );
  if (!rows.length) return '';
  return (
    '\n\nRECENT HUMAN CORRECTIONS (learn from these — reviewers overrode earlier AI output):\n' +
    rows
      .map((r) => `- "${(r.title + ': ' + r.body).slice(0, 220)}" → ${r.field} should be "${r.final_value}" (AI said "${r.ai_value}")${r.note ? ` — reviewer note: ${r.note}` : ''}`)
      .join('\n')
  );
}

export async function llmAnalyze(input: { title: string; english: string; locationInput: string; districtInput: string }) {
  const taxonomy = DOMAINS.map(
    (d) => `${d.key} (${d.label}):\n` + CATEGORIES.filter((c) => c.domain === d.key).map((c) => `  - ${c.key}: ${c.label} — ${c.description}`).join('\n'),
  ).join('\n');

  const system =
    `You are the triage analyst of a multi-domain public grievance system in India. Classify each complaint, assess it and extract location.\n\n` +
    `TAXONOMY (domain → category keys):\n${taxonomy}\n\n` +
    `SEVERITY RUBRIC (1–5):\n1 Minimal – inconvenience, no harm.\n2 Low – service delay affecting an individual.\n3 Moderate – recurring service failure or a household/small group affected.\n` +
    `4 High – essential service down, health impact, community-wide, or vulnerable people affected.\n5 Critical – risk to life or safety, outbreak, abuse, or emergency.\n\n` +
    `RULES:\n- Pick exactly one domain and a category key that belongs to that domain.\n- confidence is your calibrated probability (0–1) that the category is correct; lower it for vague, mixed or very short complaints.\n` +
    `- evidence_phrases are short verbatim phrases from the complaint that justify the classification.\n- alternatives: up to 3 next-best (domain, category) pairs with confidences.\n` +
    `- location.district must be one of: ${districtNames.join(', ')} — or an empty string if unknown. Use the citizen-provided location if given.\n` +
    `- duration_days: how long the problem has persisted, or null if not stated.\n- summary: one neutral sentence (max 25 words) a department officer can act on.` +
    correctionMemory();

  const user = `TITLE: ${input.title}\nCITIZEN-PROVIDED LOCATION: ${input.locationInput || '(none)'}; DISTRICT: ${input.districtInput || '(none)'}\nCOMPLAINT (English):\n${input.english}`;

  return chatJSON<LLMAnalysis>({
    schemaName: 'grievance_analysis',
    system,
    user,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['domain', 'category', 'confidence', 'rationale', 'evidence_phrases', 'alternatives', 'context', 'severity', 'location', 'summary'],
      properties: {
        domain: { type: 'string', enum: DOMAINS.map((d) => d.key) },
        category: { type: 'string', enum: CATEGORIES.map((c) => c.key) },
        confidence: { type: 'number' },
        rationale: { type: 'string' },
        evidence_phrases: { type: 'array', items: { type: 'string' } },
        alternatives: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['domain', 'category', 'confidence'],
            properties: { domain: { type: 'string', enum: DOMAINS.map((d) => d.key) }, category: { type: 'string', enum: CATEGORIES.map((c) => c.key) }, confidence: { type: 'number' } },
          },
        },
        context: {
          type: 'object', additionalProperties: false,
          required: ['affected_scope', 'vulnerable_groups', 'safety_risk', 'essential_service_disrupted', 'duration_days', 'sentiment', 'is_actionable', 'mixed_issues'],
          properties: {
            affected_scope: { type: 'string', enum: ['individual', 'household', 'community', 'large_population'] },
            vulnerable_groups: { type: 'array', items: { type: 'string' } },
            safety_risk: { type: 'boolean' },
            essential_service_disrupted: { type: 'boolean' },
            duration_days: { type: ['number', 'null'] },
            sentiment: { type: 'string', enum: ['calm', 'frustrated', 'distressed', 'urgent'] },
            is_actionable: { type: 'boolean' },
            mixed_issues: { type: 'boolean' },
          },
        },
        severity: {
          type: 'object', additionalProperties: false, required: ['level', 'justification', 'factors'],
          properties: { level: { type: 'integer', enum: [1, 2, 3, 4, 5] }, justification: { type: 'string' }, factors: { type: 'array', items: { type: 'string' } } },
        },
        location: {
          type: 'object', additionalProperties: false, required: ['text', 'locality', 'district', 'state', 'confidence'],
          properties: { text: { type: 'string' }, locality: { type: 'string' }, district: { type: 'string' }, state: { type: 'string' }, confidence: { type: 'number' } },
        },
        summary: { type: 'string' },
      },
    },
  });
}

/* ── FR18 ───────────────────────────────────────────────────────── */

export interface LLMRecommendation { actions: string[]; expected_resolution_days: number; rationale: string; referenced_cases: string[]; citizen_message: string }

export async function llmRecommend(input: {
  summary: string; category: string; categoryLabel: string; department: string; priority: string; playbook: string[];
  history: { ref: string; title: string; resolutionNote: string | null; resolvedInDays: number | null; rating: number | null; similarity: number }[];
}) {
  const hist = input.history.length
    ? input.history.map((h) => `- ${h.ref} (similarity ${h.similarity}, resolved in ${h.resolvedInDays ?? '?'} days, citizen rating ${h.rating ?? 'n/a'}/5): "${h.title}" — resolution: ${h.resolutionNote}`).join('\n')
    : '(no comparable historical cases)';
  return chatJSON<LLMRecommendation>({
    schemaName: 'resolution_recommendation',
    system:
      'You advise government department officers on how to resolve citizen grievances. Recommend concrete, verifiable action steps ' +
      '(who does what, by when). Prefer approaches that worked in highly-rated historical cases; avoid those with poor ratings. ' +
      'Cite the historical case refs you relied on. citizen_message is a short, empathetic, plain-language status note to the citizen (no promises you cannot keep).',
    user:
      `COMPLAINT SUMMARY: ${input.summary}\nCATEGORY: ${input.categoryLabel}\nDEPARTMENT: ${input.department}\nPRIORITY: ${input.priority}\n` +
      `DEPARTMENT PLAYBOOK:\n${input.playbook.map((p) => `- ${p}`).join('\n')}\n\nHISTORICAL CASES:\n${hist}`,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['actions', 'expected_resolution_days', 'rationale', 'referenced_cases', 'citizen_message'],
      properties: {
        actions: { type: 'array', items: { type: 'string' } },
        expected_resolution_days: { type: 'number' },
        rationale: { type: 'string' },
        referenced_cases: { type: 'array', items: { type: 'string' } },
        citizen_message: { type: 'string' },
      },
    },
  });
}
