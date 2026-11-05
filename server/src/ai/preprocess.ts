/**
 * FR7 — Text preprocessing: cleaning, PII masking, normalisation,
 * tokenisation, stop-word removal, light stemming and n-grams.
 */

const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also please sir madam kindly dear respected regarding request requesting hereby want wants us still even get got since many much one two three may might shall must let lets ok okay`.split(/\s+/),
);

// Negations carry meaning for complaints ("not working"), so they stay.
for (const keep of ['no', 'not', 'nor']) STOPWORDS.delete(keep);

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/n't\b/g, ' not'], [/'re\b/g, ' are'], [/'s\b/g, ''], [/'d\b/g, ' would'], [/'ll\b/g, ' will'], [/'ve\b/g, ' have'], [/'m\b/g, ' am'],
];

export function stem(w: string): string {
  if (!/^[a-z]+$/.test(w) || w.length <= 3) return w;
  const rules: [RegExp, string][] = [
    [/ational$/, 'ate'], [/ization$/, 'ize'], [/fulness$/, 'ful'], [/iveness$/, 'ive'], [/ousness$/, 'ous'],
    [/ments?$/, ''], [/ness$/, ''], [/ies$/, 'y'], [/ied$/, 'y'], [/ing$/, ''], [/edly$/, ''], [/ed$/, ''], [/ly$/, ''], [/(ss)$/, '$1'], [/s$/, ''],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const out = w.replace(re, rep);
      if (out.length >= 3) return out.replace(/(.)\1$/, (m, c) => (/[lsz]/.test(c) ? m : c));
    }
  }
  return w;
}

export interface Preprocessed {
  cleaned: string;
  normalized: string;
  tokens: string[];
  terms: string[];
  bigrams: string[];
  stats: { characters: number; sentences: number; tokens: number; terms: number; unique: number; stopwordsRemoved: number; piiMasked: number };
}

export function preprocess(text: string): Preprocessed {
  let pii = 0;
  let cleaned = text
    .normalize('NFC')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' [url] ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => (pii++, ' [email] '))
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, () => (pii++, ' [phone] '))
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, () => (pii++, ' [id-number] '))
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/([!?.,])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  let normalized = cleaned.toLowerCase();
  for (const [re, rep] of CONTRACTIONS) normalized = normalized.replace(re, rep);

  const sentences = cleaned.split(/[.!?।]+/).filter((s) => s.trim().length > 2).length || (cleaned ? 1 : 0);
  const tokens = normalized.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const kept = tokens.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t) && t.length > 1);
  const terms = kept.map(stem);
  const bigrams: string[] = [];
  for (let i = 0; i < kept.length - 1; i++) bigrams.push(`${terms[i]}_${terms[i + 1]}`);

  return {
    cleaned,
    normalized,
    tokens,
    terms,
    bigrams,
    stats: {
      characters: cleaned.length,
      sentences,
      tokens: tokens.length,
      terms: terms.length,
      unique: new Set(terms).size,
      stopwordsRemoved: tokens.length - kept.length,
      piiMasked: pii,
    },
  };
}

/** Feature bag used by local classifier and TF-IDF similarity. */
export function features(text: string): string[] {
  const p = preprocess(text);
  return [...p.terms, ...p.bigrams];
}
