/**
 * FR5 — Language detection (Telugu / Hindi / English), including romanised
 * Hindi & Telugu written in Latin script.
 * FR6 — Local fallback translation via a phrase glossary. The OpenAI engine
 * replaces this with full neural translation when a key is configured.
 */

export type Lang = 'en' | 'hi' | 'te';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', hi: 'Hindi', te: 'Telugu' };

export interface LanguageResult {
  code: Lang;
  label: string;
  script: 'latin' | 'devanagari' | 'telugu' | 'mixed';
  confidence: number;
  method: string;
  scripts: { telugu: number; devanagari: number; latin: number };
  romanized: boolean;
}

const ROMAN_HI = ['hai', 'hain', 'nahi', 'nahin', 'mein', 'mera', 'meri', 'hamare', 'hamara', 'kya', 'kab', 'kyun', 'paani', 'pani', 'bijli', 'sadak', 'kachra', 'aur', 'bahut', 'raha', 'rahi', 'gaya', 'hua', 'ke', 'ki', 'ko', 'se', 'bhi', 'abhi', 'din', 'log', 'sarkar', 'kripya', 'jaldi'];
const ROMAN_TE = ['ledu', 'ledhu', 'undi', 'unnayi', 'chala', 'emi', 'enduku', 'neellu', 'neeru', 'current', 'rodlu', 'chetta', 'maa', 'mee', 'lo', 'ga', 'kani', 'inka', 'roju', 'rojulu', 'raavadam', 'ivvatledu', 'cheyyandi', 'dayachesi', 'vasthundi', 'pani cheyatledu', 'baaga'];

export function scriptProfile(text: string) {
  let telugu = 0, devanagari = 0, latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0c00 && c <= 0x0c7f) telugu++;
    else if (c >= 0x0900 && c <= 0x097f) devanagari++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  const total = telugu + devanagari + latin || 1;
  return { telugu: telugu / total, devanagari: devanagari / total, latin: latin / total };
}

export function detectLanguage(text: string): LanguageResult {
  const s = scriptProfile(text);
  const mixed = [s.telugu, s.devanagari, s.latin].filter((v) => v > 0.15).length > 1;
  if (s.telugu >= 0.3 && s.telugu >= s.devanagari) {
    return { code: 'te', label: 'Telugu', script: mixed ? 'mixed' : 'telugu', confidence: round(0.6 + s.telugu * 0.4), method: 'unicode-script', scripts: rs(s), romanized: false };
  }
  if (s.devanagari >= 0.3) {
    return { code: 'hi', label: 'Hindi', script: mixed ? 'mixed' : 'devanagari', confidence: round(0.6 + s.devanagari * 0.4), method: 'unicode-script', scripts: rs(s), romanized: false };
  }
  // Latin script — check for romanised Hindi / Telugu function words.
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const total = words.length || 1;
  const hi = words.filter((w) => ROMAN_HI.includes(w)).length / total;
  const te = words.filter((w) => ROMAN_TE.includes(w)).length / total;
  if (Math.max(hi, te) >= 0.12) {
    const code: Lang = te > hi ? 'te' : 'hi';
    return { code, label: LANG_LABEL[code], script: 'latin', confidence: round(Math.min(0.9, 0.5 + Math.max(hi, te))), method: 'romanized-lexicon', scripts: rs(s), romanized: true };
  }
  return { code: 'en', label: 'English', script: 'latin', confidence: round(Math.min(0.99, 0.75 + s.latin * 0.24 - Math.max(hi, te))), method: 'unicode-script', scripts: rs(s), romanized: false };
}

const round = (n: number) => Math.round(n * 100) / 100;
const rs = (s: { telugu: number; devanagari: number; latin: number }) => ({ telugu: round(s.telugu), devanagari: round(s.devanagari), latin: round(s.latin) });

/* ── Glossary translation (fallback) ─────────────────────────────── */

const GLOSSARY: Record<string, string> = {
  // Telugu
  'మా కాలనీలో': 'in our colony', 'మా గ్రామంలో': 'in our village', 'మా ప్రాంతంలో': 'in our area', 'త్రాగునీరు రావడం లేదు': 'drinking water is not coming',
  'చాలా ఇబ్బంది పడుతున్నాం': 'we are facing a lot of trouble', 'బాధపడుతున్నారు': 'are suffering', 'మరియు': 'and', 'ప్రాంతంలో': 'in the area',
  'కొనలేకపోతున్నారు': 'cannot afford to buy', 'లేవు': 'are not there', 'కోసం': 'for',
  'రావడం లేదు': 'is not coming', 'అందుబాటులో లేవు': 'are not available', 'పని చేయడం లేదు': 'is not working', 'వెలగడం లేదు': 'are not working',
  'వీధి దీపాలు': 'street lights', 'మధ్యాహ్న భోజనం': 'mid-day meal', 'రేషన్ కార్డు': 'ration card', 'చాలా రోజులుగా': 'for many days',
  'మా': 'our', 'మేము': 'we', 'మాకు': 'to us', 'కాలనీలో': 'in the colony', 'కాలనీ': 'colony', 'గ్రామంలో': 'in the village', 'గ్రామం': 'village',
  'గత': 'past', 'ఒక': 'one', 'రెండు': 'two', 'మూడు': 'three', 'నాలుగు': 'four', 'ఐదు': 'five', 'పది': 'ten', 'వారం': 'week', 'వారాలుగా': 'for weeks',
  'రోజులుగా': 'for days', 'రోజూ': 'every day', 'రోజులు': 'days', 'నెలలుగా': 'for months', 'త్రాగునీరు': 'drinking water', 'మంచినీరు': 'drinking water',
  'నీరు': 'water', 'నీళ్లు': 'water', 'చాలా': 'very', 'ఇబ్బంది': 'trouble', 'పడుతున్నాం': 'we are facing', 'ప్రభుత్వ': 'government', 'ఆసుపత్రిలో': 'in the hospital',
  'ఆసుపత్రి': 'hospital', 'మందులు': 'medicines', 'డాక్టర్లు': 'doctors', 'డాక్టర్': 'doctor', 'సమయానికి': 'on time', 'పాఠశాలలో': 'in the school', 'పాఠశాల': 'school',
  'ఉపాధ్యాయులు': 'teachers', 'ఉపాధ్యాయుడు': 'teacher', 'పిల్లల': "children's", 'పిల్లలు': 'children', 'చదువు': 'education', 'దెబ్బతింటోంది': 'is getting affected',
  'రోడ్డు': 'road', 'మీద': 'on', 'పెద్ద': 'big', 'గుంతలు': 'potholes', 'ఉన్నాయి': 'there are', 'రాత్రి': 'at night', 'చెత్త': 'garbage', 'తీయడం': 'collecting',
  'లేదు': 'not', 'కాలువ': 'drain', 'మురుగు': 'sewage', 'నీరు నిలిచి': 'water stagnating', 'దోమలు': 'mosquitoes', 'జ్వరం': 'fever', 'కరెంట్': 'electricity',
  'విద్యుత్': 'electricity', 'రేషన్': 'ration', 'బియ్యం': 'rice', 'ఇవ్వడం': 'giving', 'అధికారులు': 'officials', 'ఫిర్యాదు': 'complaint', 'చేసినా': 'even after making',
  'స్పందించడం': 'responding', 'దయచేసి': 'please', 'వెంటనే': 'immediately', 'చర్య': 'action', 'తీసుకోండి': 'take', 'అంబులెన్స్': 'ambulance', 'ఆలస్యం': 'delay',
  'లంచం': 'bribe', 'అడుగుతున్నారు': 'are demanding', 'స్కాలర్‌షిప్': 'scholarship', 'ఫీజు': 'fee', 'బస్సు': 'bus', 'ఆగడం': 'stopping', 'వృద్ధులు': 'elderly people',
  'రోగులు': 'patients', 'బయట': 'outside', 'కొనమంటున్నారు': 'are asking to buy', 'ప్రమాదం': 'danger', 'భోజనం': 'meal', 'పురుగులు': 'insects', 'వచ్చాయి': 'came',
  // Hindi
  'राशन कार्ड': 'ration card', 'अभी तक': 'so far', 'के लिए': 'for', 'मैंने': 'I', 'पहले': 'ago', 'अपनी': 'my', 'अपने': 'my', 'कार्ड': 'card', 'दिया था': 'had submitted', 'जोड़ा गया है': 'has been added', 'वाला': '', 'जोड़ा': 'added', 'लिए': 'for', 'था': 'was', 'रोज़': 'daily', 'नहीं रहती': 'is not available',
  'हमारे इलाके में': 'in our area', 'हमारे मोहल्ले में': 'in our neighbourhood', 'हमारे गांव में': 'in our village',
  'नहीं आया है': 'has not come', 'नहीं आते': 'do not come', 'नहीं उठाया गया है': 'has not been collected', 'नहीं मिल रहा': 'is not available', 'पीने का पानी': 'drinking water',
  'हमारे': 'our', 'हमारी': 'our', 'हम': 'we', 'इलाके': 'area', 'इलाके में': 'in the area', 'मोहल्ले': 'neighbourhood', 'गांव': 'village', 'में': 'in', 'पिछले': 'past', 'एक': 'one', 'दो': 'two', 'तीन': 'three',
  'हफ्ते': 'week', 'हफ्तों': 'weeks', 'दिन': 'days', 'दिनों': 'days', 'महीने': 'months', 'छह': 'six', 'से': 'since', 'कचरा': 'garbage', 'कूड़ा': 'garbage', 'नहीं': 'not',
  'उठाया': 'picked up', 'गया': 'gone', 'है': 'is', 'हैं': 'are', 'बदबू': 'stench', 'और': 'and', 'मच्छरों': 'mosquitoes', 'बच्चे': 'children', 'बच्चों': 'children', 'बीमार': 'sick',
  'हो': 'being', 'रहे': '', 'सरकारी': 'government', 'अस्पताल': 'hospital', 'डॉक्टर': 'doctor', 'समय': 'time', 'पर': 'on', 'आते': 'come', 'दवाइयाँ': 'medicines', 'दवाई': 'medicine',
  'दवा': 'medicine', 'बाहर': 'outside', 'खरीदने': 'to buy', 'को': 'to', 'कहा': 'told', 'जाता': '', 'छात्रवृत्ति': 'scholarship', 'का': 'of', 'की': 'of', 'के': 'of', 'पैसा': 'money',
  'पानी': 'water', 'बिजली': 'electricity', 'सड़क': 'road', 'गड्ढे': 'potholes', 'नाली': 'drain', 'शिक्षक': 'teacher', 'स्कूल': 'school', 'राशन': 'ration', 'रिश्वत': 'bribe',
  'मांग': 'demand', 'रहा': '', 'रही': '', 'कृपया': 'please', 'तुरंत': 'immediately', 'कार्रवाई': 'action', 'करें': 'take', 'शिकायत': 'complaint', 'अधिकारी': 'officials',
  'बुखार': 'fever', 'एम्बुलेंस': 'ambulance', 'देर': 'late', 'मरीज': 'patients', 'बुजुर्ग': 'elderly', 'खतरा': 'danger', 'भोजन': 'meal', 'खाना': 'food', 'कीड़े': 'insects',
  'ट्रांसफार्मर': 'transformer', 'कटौती': 'cuts', 'खराब': 'faulty', 'घंटे': 'hours', 'गर्मी': 'heat', 'परेशान': 'troubled', 'बहुत': 'very', 'रहती': '', 'बार-बार': 'repeated', 'नाम': 'name', 'जोड़ने': 'adding', 'आवेदन': 'application', 'बेटी': 'daughter', 'दुकान': 'shop', 'कम': 'less', 'देता': 'gives',
  'लाइट': 'lights', 'बंद': 'off', 'टूटी': 'broken', 'पाइपलाइन': 'pipeline', 'गंदा': 'dirty', 'आ': 'coming',
  // Romanised
  'paani nahi aa raha': 'water is not coming', 'neellu raavadam ledu': 'water is not coming', 'current ledu': 'no electricity', 'ledu': 'not', 'nahi': 'not', 'paani': 'water',
  'neellu': 'water', 'bijli': 'electricity', 'sadak': 'road', 'kachra': 'garbage', 'chetta': 'garbage', 'hamare': 'our', 'maa': 'our', 'bahut': 'very', 'chala': 'very',
};

const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

const NUM_WORDS: Record<string, string> = {
  'ఒక': 'one', 'రెండు': 'two', 'మూడు': 'three', 'నాలుగు': 'four', 'ఐదు': 'five', 'ఆరు': 'six', 'పది': 'ten',
  'एक': 'one', 'दो': 'two', 'तीन': 'three', 'चार': 'four', 'पांच': 'five', 'पाँच': 'five', 'छह': 'six', 'दस': 'ten',
};

/** Phrase-level patterns that word-by-word substitution would mangle (SOV word order). */
const PATTERNS: [RegExp, (m: string, ...g: string[]) => string][] = [
  [/గత\s+(\S+)\s+రోజులుగా/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} days `],
  [/గత\s+(\S+)\s+వారాలుగా/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} weeks `],
  [/గత\s+(\S+)\s+నెలలుగా/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} months `],
  [/पिछले\s+(\S+)\s+(दिन|दिनों)\s+से/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} days `],
  [/पिछले\s+(\S+)\s+(हफ्ते|हफ्तों)\s+से/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} weeks `],
  [/पिछले\s+(\S+)\s+(महीने|महीनों)\s+से/g, (_m, n) => ` for the past ${NUM_WORDS[n] ?? n} months `],
  [/(\S+)\s+महीने\s+से/g, (_m, n) => ` for ${NUM_WORDS[n] ?? n} months `],
];

export function glossaryTranslate(text: string): { text: string; coverage: number } {
  let out = text;
  let hits = 0;
  for (const [re, fn] of PATTERNS) out = out.replace(re, (...args) => { hits += 3; return fn(...(args as [string, ...string[]])); });
  for (const k of GLOSSARY_KEYS) {
    const isLatin = /^[a-z ]+$/.test(k);
    // Indic scripts have no \b semantics in JS, so bound on whitespace / punctuation.
    const re = isLatin
      ? new RegExp(`\\b${k}\\b`, 'gi')
      : new RegExp(`(?<=^|[\\s,.!?।()"'])${escapeRe(k)}(?=$|[\\s,.!?।()"'])`, 'g');
    out = out.replace(re, () => {
      hits += k.split(' ').length;
      return GLOSSARY[k] ? ` ${GLOSSARY[k]} ` : ' ';
    });
  }
  out = out.replace(/\s+([,.!?।])/g, '$1').replace(/।/g, '.').replace(/\s{2,}/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  return { text: out.charAt(0).toUpperCase() + out.slice(1), coverage: Math.min(1, hits / words) };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
