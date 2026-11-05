/**
 * FR11 severity, FR12 priority and FR13 location. Priority is always computed
 * deterministically from severity + context so that it is explainable and
 * consistent regardless of which engine produced the severity.
 */
import { SIGNALS, DISTRICTS, categoryByKey, SEVERITY_LABELS } from './taxonomy.js';

export interface ContextSignals {
  lifeSafety: string[];
  vulnerable: string[];
  scale: string[];
  urgency: string[];
  essential: string[];
  durationDays: number | null;
}

function findTerms(text: string, list: string[]): string[] {
  const lower = text.toLowerCase();
  const hits = list.filter((t) =>
    /^[a-z0-9 .'-]+$/i.test(t) ? new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower) : lower.includes(t),
  );
  return [...new Set(hits)];
}

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, several: 5, many: 7, fifteen: 15, twenty: 20 };
const INDIC_NUM: [RegExp, number][] = [[/ఒక|एक/, 1], [/రెండు|दो/, 2], [/మూడు|तीन/, 3], [/నాలుగు|चार/, 4], [/ఐదు|पांच|पाँच/, 5], [/ఆరు|छह/, 6], [/పది|दस/, 10]];

export function parseDurationDays(text: string): number | null {
  const lower = text.toLowerCase();
  const m = lower.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|few|several|many|fifteen|twenty)\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]] ?? 1;
    const unit = m[2].startsWith('day') ? 1 : m[2].startsWith('week') ? 7 : m[2].startsWith('month') ? 30 : 365;
    return n * unit;
  }
  // Indic: "<num> రోజులుగా / दिन / హఫ్తే / వారం / महीने"
  const unitRe: [RegExp, number][] = [[/రోజులు|రోజులుగా|दिन|दिनों/, 1], [/వారం|వారాలుగా|हफ्ते|हफ्तों|सप्ताह/, 7], [/నెల|నెలలుగా|महीने|महीनों/, 30]];
  for (const [ure, mult] of unitRe) {
    if (ure.test(text)) {
      const n = INDIC_NUM.find(([re]) => re.test(text))?.[1] ?? 1;
      return n * mult;
    }
  }
  return null;
}

export function contextSignals(text: string): ContextSignals {
  return {
    lifeSafety: findTerms(text, SIGNALS.lifeSafety),
    vulnerable: findTerms(text, SIGNALS.vulnerable),
    scale: findTerms(text, SIGNALS.scale),
    urgency: findTerms(text, SIGNALS.urgency),
    essential: findTerms(text, SIGNALS.essential),
    durationDays: parseDurationDays(text),
  };
}

export interface SeverityResult {
  level: number;
  label: string;
  factors: { label: string; weight: number }[];
  justification: string;
}

export function localSeverity(category: string, s: ContextSignals): SeverityResult {
  const base = categoryByKey.get(category)?.baseSeverity ?? 3;
  const factors: { label: string; weight: number }[] = [{ label: `Category baseline (${categoryByKey.get(category)?.label ?? category})`, weight: base }];
  let level: number = base;
  if (s.lifeSafety.length) { level += 2; factors.push({ label: `Life-safety risk: ${s.lifeSafety.slice(0, 3).join(', ')}`, weight: 2 }); }
  if (s.vulnerable.length) { level += 0.5; factors.push({ label: `Vulnerable group affected: ${s.vulnerable.slice(0, 3).join(', ')}`, weight: 0.5 }); }
  if (s.scale.length) { level += 0.5; factors.push({ label: `Community-wide impact: ${s.scale.slice(0, 2).join(', ')}`, weight: 0.5 }); }
  if (s.essential.length && s.durationDays && s.durationDays >= 2) { level += 0.5; factors.push({ label: `Essential service disrupted for ~${s.durationDays} days`, weight: 0.5 }); }
  else if (s.durationDays && s.durationDays >= 14) { level += 0.5; factors.push({ label: `Long-standing issue (~${s.durationDays} days)`, weight: 0.5 }); }
  if (s.urgency.length && !s.lifeSafety.length) { level += 0.25; factors.push({ label: `Urgency language: ${s.urgency.slice(0, 2).join(', ')}`, weight: 0.25 }); }
  // "Critical" is reserved for explicit risk to life/safety or inherently critical categories.
  const ceiling = s.lifeSafety.length || base >= 5 ? 5 : 4;
  const final = Math.max(1, Math.min(ceiling, Math.round(level)));
  return { level: final, label: SEVERITY_LABELS[final], factors, justification: factors.map((f) => f.label).join('; ') };
}

export interface PriorityResult {
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  score: number;
  breakdown: { label: string; points: number }[];
}

export function computePriority(input: { severity: number; signals: ContextSignals; duplicateCount: number; reopened?: boolean }): PriorityResult {
  const b: { label: string; points: number }[] = [{ label: `Severity ${input.severity} × 15`, points: input.severity * 15 }];
  const s = input.signals;
  if (s.lifeSafety.length) b.push({ label: 'Life-safety risk', points: 15 });
  if (s.vulnerable.length) b.push({ label: 'Vulnerable persons involved', points: 8 });
  if (s.scale.length) b.push({ label: 'Affects a community', points: 8 });
  if (s.essential.length) b.push({ label: 'Essential service', points: 5 });
  if (s.durationDays && s.durationDays >= 7) b.push({ label: `Pending ${s.durationDays}+ days`, points: 5 });
  if (input.duplicateCount > 0) b.push({ label: `${input.duplicateCount} similar report(s) in area`, points: Math.min(12, input.duplicateCount * 4) });
  if (input.reopened) b.push({ label: 'Reopened after unsatisfactory resolution', points: 10 });
  const score = Math.min(100, b.reduce((a, x) => a + x.points, 0));
  const priority = score >= 85 ? 'P1' : score >= 62 ? 'P2' : score >= 40 ? 'P3' : 'P4';
  return { priority, score, breakdown: b };
}

export interface LocationResult {
  text: string;
  locality: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  source: 'user' | 'text' | 'ai' | 'none';
  confidence: number;
  mentions: string[];
}

export function locate(input: { text: string; locationInput?: string; districtInput?: string; pincode?: string }): LocationResult {
  const hay = `${input.locationInput ?? ''} ${input.text}`.toLowerCase();
  const mentions: { district: string; state: string; alias: string }[] = [];
  for (const d of DISTRICTS) {
    for (const a of d.aliases) {
      const isLatin = /^[a-z .]+$/.test(a);
      const hit = isLatin ? new RegExp(`\\b${a.replace(/\./g, '\\.')}\\b`).test(hay) : hay.includes(a);
      if (hit) { mentions.push({ district: d.name, state: d.state, alias: a }); break; }
    }
  }
  const pincode = input.pincode || hay.match(/\b[1-8]\d{5}\b/)?.[0] || null;
  const userDistrict = input.districtInput ? DISTRICTS.find((d) => d.name === input.districtInput) : undefined;

  if (userDistrict) {
    const agree = mentions.some((m) => m.district === userDistrict.name);
    return {
      text: input.locationInput || userDistrict.name,
      locality: input.locationInput || mentions.find((m) => m.district === userDistrict.name)?.alias || null,
      district: userDistrict.name,
      state: userDistrict.state,
      pincode,
      source: 'user',
      confidence: agree || !mentions.length ? 0.95 : 0.75,
      mentions: mentions.map((m) => m.alias),
    };
  }
  if (mentions.length) {
    const m = mentions[0];
    return { text: input.locationInput || titleCase(m.alias), locality: titleCase(m.alias), district: m.district, state: m.state, pincode, source: 'text', confidence: mentions.length === 1 ? 0.8 : 0.6, mentions: mentions.map((x) => x.alias) };
  }
  return { text: input.locationInput || '', locality: input.locationInput || null, district: null, state: null, pincode, source: input.locationInput ? 'user' : 'none', confidence: input.locationInput ? 0.4 : 0, mentions: [] };
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
