import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession, useTheme, homeFor } from '../lib/session';
import { Brand, PriorityStamp, Severity, DomainTag } from '../components/ui';
import { Icon } from '../components/Icon';
import { CountUp, Orbs, trackPointer, useReveal } from '../components/Motion';
import type { Taxonomy } from '../lib/types';

/* ── Procedural topographic contours ──────────────────────────── */
function Contours() {
  const paths = useMemo(() => {
    const out: string[] = [];
    const cx = 760, cy = 330;
    for (let k = 0; k < 16; k++) {
      const base = 50 + k * 34;
      const pts: string[] = [];
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * Math.PI * 2;
        const wob = Math.sin(t * 3 + k * 0.6) * (8 + k * 1.6) + Math.cos(t * 5 - k * 0.4) * (5 + k) + Math.sin(t * 2 + k) * 6;
        const r = base + wob;
        pts.push(`${(cx + Math.cos(t) * r * 1.45).toFixed(1)},${(cy + Math.sin(t) * r * 0.82).toFixed(1)}`);
      }
      out.push(`M${pts.join(' L')}Z`);
    }
    return out;
  }, []);
  return (
    <svg className="contours" viewBox="0 0 1400 760" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} style={{ animationDelay: `${i * 90}ms` }} strokeOpacity={i % 4 === 0 ? 0.9 : 0.45} />)}
    </svg>
  );
}

/* ── Animated analysis specimen ───────────────────────────────── */
const SPECIMENS = [
  {
    lang: 'te', label: 'Telugu', ref: 'PLB-2610-00417',
    text: 'మా కాలనీలో గత మూడు రోజులుగా త్రాగునీరు రావడం లేదు. వృద్ధులు, పిల్లలు ఇబ్బంది పడుతున్నారు.',
    en: 'No drinking water in our colony for the past three days. Elderly people and children are suffering.',
    domain: 'public_service' as const, category: 'Drinking Water Supply', sev: 4, p: 'P2' as const, dept: 'WSB · Water Supply & Sewerage Board', place: 'Kukatpally · Medchal–Malkajgiri', conf: 0.91, dup: '1 related report nearby',
  },
  {
    lang: 'hi', label: 'Hindi', ref: 'PLB-2610-00418',
    text: 'सरकारी अस्पताल में दवाइयाँ नहीं मिल रहीं, मरीजों को बाहर से खरीदने को कहा जाता है।',
    en: 'Medicines are not available at the government hospital; patients are told to buy them outside.',
    domain: 'healthcare' as const, category: 'Medicine & Supply Shortage', sev: 4, p: 'P2' as const, dept: 'DCA · Drug Control Administration', place: 'Guntur · Andhra Pradesh', conf: 0.88, dup: '3 resolved precedents',
  },
  {
    lang: 'en', label: 'English', ref: 'PLB-2610-00419',
    text: 'Open manhole near the school gate on Road No. 36 — a child almost fell in last evening.',
    en: 'Open manhole near the school gate on Road No. 36 — a child almost fell in last evening.',
    domain: 'public_service' as const, category: 'Roads & Potholes', sev: 5, p: 'P1' as const, dept: 'MAD · Municipal Administration', place: 'Jubilee Hills · Hyderabad', conf: 0.86, dup: 'Auto-escalated · L1',
  },
];
const SPEC_STAGES = ['Detect language', 'Translate', 'Preprocess', 'Classify', 'Weigh severity', 'Locate', 'Search precedent', 'Prioritise', 'Route'];

function Specimen() {
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);
  const s = SPECIMENS[i];
  useEffect(() => {
    setTick(0);
    const id = window.setInterval(() => setTick((t) => t + 1), 420);
    return () => window.clearInterval(id);
  }, [i]);
  useEffect(() => {
    if (tick > SPEC_STAGES.length + 9) setI((x) => (x + 1) % SPECIMENS.length);
  }, [tick]);
  const done = Math.min(tick, SPEC_STAGES.length);
  const finished = tick > SPEC_STAGES.length;

  return (
    <div className="specimen sheet reg" aria-label="Example: how a complaint is analysed">
      <div className="sheet-head">
        <span className="fig">FIG. 01</span>
        <span className="title grow mono xs" style={{ fontWeight: 500, color: 'var(--ink-3)' }}>{s.ref}</span>
        <span className="tag tag-accent">{s.label} detected</span>
      </div>
      <div className="sheet-body col gap-16">
        <p className={`specimen-text lang-${s.lang}`} key={`t${i}`} lang={s.lang}>{s.text}</p>
        {s.lang !== 'en' && (
          <div className={`specimen-trans${tick >= 2 ? ' show' : ''}`}>
            <span className="label">Translated · EN</span>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>“{s.en}”</p>
          </div>
        )}
        <div className="specimen-stages">
          {SPEC_STAGES.map((st, k) => (
            <span key={st} className={`sp-stage${k < done ? ' done' : k === done && !finished ? ' run' : ''}`}>
              <i />{st}
            </span>
          ))}
        </div>
        <div className={`specimen-out${finished ? ' show' : ''}`}>
          <div className="row between wrap gap-12">
            <div className="col gap-6">
              <DomainTag domain={s.domain} />
              <span className="h3">{s.category}</span>
            </div>
            <div className="row gap-16">
              <Severity level={s.sev} />
              <PriorityStamp p={s.p} lg />
            </div>
          </div>
          <div className="specimen-grid">
            <div><span className="label">Department</span><span className="small">{s.dept}</span></div>
            <div><span className="label">Location</span><span className="small">{s.place}</span></div>
            <div><span className="label">Confidence</span><span className="small num">{Math.round(s.conf * 100)}% · verified by official</span></div>
            <div><span className="label">Precedent</span><span className="small">{s.dup}</span></div>
          </div>
        </div>
      </div>
      <div className="specimen-dots">
        {SPECIMENS.map((_, k) => <button key={k} aria-label={`Example ${k + 1}`} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

const STEPS = [
  { n: 'i', t: 'Speak plainly', d: 'File from any device in Telugu, Hindi or English — attach photos, documents or voice notes as evidence.', fr: 'FR1–4' },
  { n: 'ii', t: 'Understood in any tongue', d: 'Script and lexicon analysis detects the language; neural translation renders it faithfully into English.', fr: 'FR5–6' },
  { n: 'iii', t: 'Cleaned & tokenised', d: 'PII is masked, text normalised, stop-words removed and stems extracted before any model reads it.', fr: 'FR7' },
  { n: 'iv', t: 'Classified with doubt', d: 'Two engines — an LLM and a local Bayesian model — classify domain and category, then cross-examine each other.', fr: 'FR8–10' },
  { n: 'v', t: 'Weighed & placed', d: 'Severity, an explainable priority score and the location are assessed from context, not keywords alone.', fr: 'FR11–13' },
  { n: 'vi', t: 'Checked against history', d: 'Semantic search surfaces duplicates and resolved precedents, and drafts a resolution plan from what worked.', fr: 'FR16–18' },
  { n: 'vii', t: 'Verified by a human', d: 'An official reviews every AI judgement, corrects what is wrong, then assigns the case to the right department.', fr: 'FR14–15 · 19–20' },
  { n: 'viii', t: 'Tracked in real time', d: 'Live status, deadlines per priority and automatic escalation when a case stalls or is urgent.', fr: 'FR21–23' },
  { n: 'ix', t: 'Learns from the record', d: 'Citizen ratings and every official correction feed back into the models — the system gets truer with use.', fr: 'FR24–25' },
];

export function Landing() {
  const { user } = useSession();
  const { theme, toggle } = useTheme();
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<{ total: number; resolved: number; medianResolutionHours: number | null; satisfaction: number | null; departments: number; engine: string }>('/meta/stats') });
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.get<Taxonomy>('/meta/taxonomy'), staleTime: Infinity });
  const s = stats.data;
  useReveal([tax.data, s]);

  return (
    <div className="landing">
      <nav className="l-nav">
        <Brand />
        <div className="l-links hide-sm">
          <a href="#how">How it works</a>
          <a href="#domains">Domains</a>
          <a href="#oversight">Oversight</a>
        </div>
        <span className="grow" />
        <button className="icon-btn" onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        {user ? (
          <Link to={homeFor(user.role)} className="btn btn-primary">Open workspace <Icon name="arrowRight" className="arrow" /></Link>
        ) : (
          <>
            <Link to="/staff/login" className="btn btn-ghost hide-sm">Staff portal</Link>
            <Link to="/login" className="btn btn-outline">Sign in</Link>
          </>
        )}
      </nav>

      <header className="hero">
        <div className="hero-art" style={{ backgroundImage: 'url(/assets/hero-mesh.png)' }} aria-hidden />
        <Orbs n={3} />
        <Contours />
        <div className="hero-plumb" aria-hidden>
          <span className="line" />
          <svg className="bob" viewBox="0 0 24 34"><path d="M12 0 2 12l10 22 10-22z" /></svg>
        </div>
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="row gap-10 wrap rise">
              <span className="tag">§ 00</span>
              <span className="label">Grievance intelligence for education · healthcare · public services</span>
            </div>
            <h1 className="display hero-title rise" style={{ animationDelay: '.05s' }}>
              Every grievance,<br />
              drawn <em>true.</em>
            </h1>
            <p className="lead rise" style={{ animationDelay: '.12s', fontSize: 17 }}>
              Write in <span lang="te" className="accent">తెలుగు</span>, <span lang="hi" className="accent">हिन्दी</span> or English. Plumbline reads it, weighs its urgency,
              finds what was done before, and routes it to the people who can fix it — with an official verifying every judgement.
            </p>
            <div className="row wrap gap-12 rise" style={{ animationDelay: '.18s' }}>
              <Link to={user?.role === 'citizen' ? '/app/new' : '/register'} className="btn btn-primary btn-lg">File a grievance <Icon name="arrowRight" className="arrow" /></Link>
              <Link to={user?.role === 'citizen' ? '/app' : '/login'} className="btn btn-outline btn-lg">Track my complaints</Link>
            </div>
            <dl className="hero-stats rise" style={{ animationDelay: '.26s' }}>
              <div><dt className="label">Resolved</dt><dd className="num"><CountUp value={s?.resolved} /></dd></div>
              <div><dt className="label">Median resolution</dt><dd className="num">{s?.medianResolutionHours != null ? <><CountUp value={Math.round((s.medianResolutionHours / 24) * 10) / 10} decimals={1} />d</> : '—'}</dd></div>
              <div><dt className="label">Citizen rating</dt><dd className="num"><CountUp value={s?.satisfaction} decimals={1} /><small>/5</small></dd></div>
              <div><dt className="label">Departments</dt><dd className="num"><CountUp value={s?.departments} /></dd></div>
            </dl>
          </div>
          <div className="hero-visual rise" style={{ animationDelay: '.2s' }}>
            <Specimen />
          </div>
        </div>
        <div className="ruler hero-ruler" />
      </header>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((k) => (
            <span key={k} className="row" style={{ gap: 0 }}>
              {(tax.data?.categories ?? []).map((c) => (
                <span key={`${k}${c.key}`} className="marquee-item"><i style={{ background: `var(--dom-${c.domain})` }} />{c.label}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="l-section" id="how">
        <div className="l-head reveal">
          <span className="tag">§ 01</span>
          <h2 className="display l-h2">The instrument, <em>in nine movements.</em></h2>
          <p className="lead">From the moment a citizen speaks to the moment the record improves itself — each step maps to a requirement, and each is visible to the people it affects.</p>
        </div>
        <ol className="steps">
          {STEPS.map((st, i) => (
            <li key={st.n} className="step sheet reveal" style={{ ['--d' as string]: `${(i % 3) * 90}ms` }} onMouseMove={trackPointer}>
              <div className="row between">
                <span className="step-n">{st.n}</span>
                <span className="tag">{st.fr}</span>
              </div>
              <h3 className="h2" style={{ fontWeight: 600 }}>{st.t}</h3>
              <p className="small ink2" style={{ lineHeight: 1.6 }}>{st.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-section" id="domains">
        <div className="l-head reveal">
          <span className="tag">§ 02</span>
          <h2 className="display l-h2">Three domains. <em>{tax.data?.categories.length ?? 25} kinds of failure.</em></h2>
          <p className="lead">A shared taxonomy across departments means a complaint lands with the team that owns it — not the one that happened to receive it.</p>
        </div>
        <div className="domains">
          {(tax.data?.domains ?? []).map((d) => {
            const cats = tax.data!.categories.filter((c) => c.domain === d.key);
            const depts = tax.data!.departments.filter((x) => x.domain === d.key);
            return (
              <article key={d.key} className="domain-col reveal" style={{ ['--c' as string]: `var(--dom-${d.key})` }}>
                <div className="domain-art" style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--c) 26%, var(--bg-3)), var(--bg-3) 70%)` }}>
                  <img src={`/assets/dom-${d.key}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
                <div className="domain-glyph"><i /></div>
                <h3 className="display" style={{ fontSize: 26 }}>{d.label}</h3>
                <p className="small ink2">{d.blurb}</p>
                <div className="label mt-8">{cats.length} categories · {depts.length} departments</div>
                <ul className="domain-cats">
                  {cats.map((c) => <li key={c.key}><span>{c.label}</span><span className="mono dim xs">{c.dept}</span></li>)}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="l-section" id="oversight">
        <div className="oversight reveal">
          <div className="col gap-16">
            <span className="tag" style={{ alignSelf: 'flex-start' }}>§ 03</span>
            <h2 className="display l-h2">Machines propose. <em>People decide.</em></h2>
            <p className="lead">
              No complaint is assigned on the model's word alone. Officials see the full reasoning — evidence phrases, confidence, the
              runner-up, every duplicate — and can override any of it. Each override is recorded, explained, and taught back to the system.
            </p>
            <ul className="oversight-list">
              <li><Icon name="shield" /> Every AI result is reviewed before assignment</li>
              <li><Icon name="scale" /> Explainable priority — each point of the score is itemised</li>
              <li><Icon name="history" /> Full public timeline for the citizen; internal notes stay internal</li>
              <li><Icon name="alert" /> Deadlines per priority with automatic escalation</li>
            </ul>
          </div>
          <LoopDiagram />
        </div>
      </section>

      <section className="l-cta">
        <div className="l-cta-inner sheet reg reveal scale" style={{ backgroundImage: 'url(/assets/hero-mesh.png)' }}>
          <Orbs n={3} />
          <h2 className="display" style={{ fontSize: 'clamp(26px, 3.2vw, 40px)' }}>Say what's wrong. <em>We'll keep it plumb.</em></h2>
          <div className="row wrap gap-12 center">
            <Link to="/register" className="btn btn-primary btn-lg">Create a citizen account <Icon name="arrowRight" className="arrow" /></Link>
            <Link to="/staff/login" className="btn btn-ghost btn-lg">I'm an official</Link>
          </div>
        </div>
      </section>

      <footer className="l-foot">
        <Brand />
        <span className="label">Multi-domain grievance management · FR1–FR25</span>
        <span className="grow" />
        <span className="xs muted">Engine: {s?.engine === 'openai' ? 'OpenAI + local NLP' : 'Local NLP'} · Built for public accountability</span>
      </footer>
    </div>
  );
}

function LoopDiagram() {
  const nodes = [
    { x: 200, y: 52, t: 'AI proposes', s: 'domain · severity · route' },
    { x: 348, y: 200, t: 'Official verifies', s: 'confirms or corrects' },
    { x: 200, y: 348, t: 'Department resolves', s: 'tracked against SLA' },
    { x: 52, y: 200, t: 'Record teaches', s: 'corrections + ratings' },
  ];
  return (
    <svg className="loop" viewBox="0 0 400 400" role="img" aria-label="Continuous improvement loop">
      <circle cx="200" cy="200" r="148" fill="none" stroke="var(--line-2)" strokeDasharray="3 5" />
      <circle cx="200" cy="200" r="148" fill="none" stroke="var(--lichen)" strokeWidth="1.5" strokeDasharray="60 870" className="loop-run" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="var(--line-1)" />
      <text x="200" y="196" textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontWeight: 650, fontSize: 22, fill: 'var(--ink-1)' }}>truer</text>
      <text x="200" y="216" textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '.16em', fill: 'var(--ink-3)' }}>WITH EVERY CASE</text>
      {nodes.map((n) => (
        <g key={n.t}>
          <rect x={n.x - 64} y={n.y - 22} width="128" height="44" rx="6" fill="var(--bg-2)" stroke="var(--line-2)" />
          <text x={n.x} y={n.y - 3} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--ink-1)' }}>{n.t}</text>
          <text x={n.x} y={n.y + 12} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '.08em', fill: 'var(--ink-3)' }}>{n.s.toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}
