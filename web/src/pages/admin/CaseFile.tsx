import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useLive, caseBase } from '../../lib/live';
import { ago, dateShort, dateTime, LANG_LABEL, pct, SEV_LABEL, STATUS_LABEL } from '../../lib/format';
import type { Analysis, ComplaintDetail, Domain, Match, Priority, Taxonomy } from '../../lib/types';
import { Button, DomainTag, ErrorState, Field, PriorityStamp, Segmented, Severity, SheetHead, Skeleton, StatusChip } from '../../components/ui';
import { Attachments, CommentBox, JourneyRail, PipelineTrace, Sla, Timeline } from '../../components/Case';
import { Gauge } from '../../components/Charts';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

type Tab = 'complaint' | 'dossier' | 'precedent' | 'timeline';

export default function CaseFile() {
  const id = Number(useParams().id);
  const { user } = useSession();
  const { stages } = useLive();
  const [tab, setTab] = useState<Tab>('dossier');
  const q = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => api.get<{ complaint: ComplaintDetail }>(`/complaints/${id}`).then((r) => r.complaint),
    refetchInterval: (query) => (query.state.data?.analyzing ? 2500 : false),
  });
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.get<Taxonomy>('/meta/taxonomy'), staleTime: Infinity });
  if (tax.data) primeCategoryLabels(tax.data);

  if (q.isLoading) return <div className="col gap-20"><div className="sheet" style={{ padding: 26 }}><Skeleton h={14} w={200} /><div className="mt-16"><Skeleton h={32} w="60%" /></div></div><div className="grid g-main-side"><div className="sheet" style={{ height: 420 }} /><div className="sheet" style={{ height: 420 }} /></div></div>;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const c = q.data!;
  const ai = c.ai as Analysis | null;
  const admin = user!.role === 'admin';
  const back = admin ? (c.status === 'awaiting_verification' ? '/admin/queue' : '/admin/complaints') : '/desk/cases';

  return (
    <div className="col gap-20">
      <Link to={back} className="row gap-6 small muted" style={{ alignSelf: 'flex-start' }}><Icon name="arrowLeft" size={14} /> {admin && c.status === 'awaiting_verification' ? 'Verification queue' : 'Case registry'}</Link>

      <section className="sheet case-hero reg rise">
        <div className="row wrap gap-10">
          <span className="ref">{c.ref}</span>
          <StatusChip status={c.status} live={c.analyzing} />
          {c.escalationLevel > 0 && <span className="chip" style={{ ['--c' as string]: 'var(--oxide)' }} title={c.escalationReason ?? ''}><Icon name="alert" size={11} /> Escalated · L{c.escalationLevel}</span>}
          <Sla due={c.slaDueAt} status={c.status} />
          {ai && <span className="tag" style={{ color: ai.engine !== 'local' ? 'var(--lichen)' : undefined }}><Icon name="cpu" /> {ai.engine === 'openai' ? 'OpenAI' : ai.engine === 'hybrid' ? 'Hybrid' : 'Local NLP'} · {(ai.totalMs / 1000).toFixed(1)}s</span>}
          <span className="grow" />
          <span className="xs muted">Filed {dateTime(c.createdAt)} · updated {ago(c.updatedAt)}</span>
        </div>
        <div className="row-top wrap gap-24 mt-12">
          <div className="col gap-10 grow" style={{ minWidth: 280 }}>
            <h1 className={`case-title${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`}>{c.title}</h1>
            {ai?.summary && <p className="serif-i ink2" style={{ fontSize: 16.5 }}>“{ai.summary}”</p>}
            <div className="row wrap gap-16 small muted">
              {c.domain && <DomainTag domain={c.domain} label={`${c.domainLabel} · ${c.categoryLabel}`} />}
              {(c.locationText || c.district) && <span className="row gap-6"><Icon name="pin" size={13} />{[c.locationText, c.district].filter(Boolean).join(', ')}</span>}
              {c.department && <span className="row gap-6"><Icon name="building" size={13} />{c.department.name}</span>}
            </div>
          </div>
          <div className="row gap-20">
            <div className="col gap-6" style={{ alignItems: 'center' }}><span className="label">Severity</span><Severity level={c.severity} lg showLabel={false} /><span className="xs" style={{ color: `var(--sev-${c.severity})` }}>{SEV_LABEL[c.severity ?? 0]}</span></div>
            <div className="col gap-6" style={{ alignItems: 'center' }}><span className="label">Priority</span><PriorityStamp p={c.priority} lg /><span className="xs muted">{ai?.priority.score ?? '—'}/100</span></div>
          </div>
        </div>
        <div className="mt-24"><JourneyRail status={c.status} /></div>
      </section>

      {c.aiError && <div className="callout danger"><Icon name="alert" /><span><b>Automated analysis failed.</b> {c.aiError} — classify manually below.</span></div>}
      {ai && c.status === 'awaiting_verification' && ai.similarity.duplicates.length > 0 && (
        <div className="callout warn">
          <Icon name="merge" />
          <span><b style={{ color: 'var(--ink-1)' }}>Possible duplicate.</b> {ai.similarity.duplicates.length} highly similar open report{ai.similarity.duplicates.length > 1 ? 's' : ''} — closest is <Link to={`/admin/c/${ai.similarity.duplicates[0].id}`} className="mono accent">{ai.similarity.duplicates[0].ref}</Link> at {pct(ai.similarity.duplicates[0].similarity)} similarity{ai.similarity.duplicates[0].sameUser ? ' (same citizen)' : ''}.</span>
          <span className="grow" />
          <button className="btn btn-sm" onClick={() => setTab('precedent')}>Compare</button>
        </div>
      )}
      {ai && c.status === 'awaiting_verification' && ai.confidence.needsReview && (
        <div className="callout info"><Icon name="gauge" /><span><b style={{ color: 'var(--ink-1)' }}>{ai.confidence.level === 'low' ? 'Low' : 'Moderate'} confidence ({pct(ai.confidence.score)}).</b> {ai.classification.agreement === 'none' ? 'The two engines disagree on the category.' : 'Check the category and severity before assigning.'}</span></div>
      )}

      <div className="grid g-main-side" style={{ gap: 20 }}>
        <div className="col gap-16" style={{ minWidth: 0 }}>
          <div className="tabs" role="tablist">
            {([
              ['dossier', 'AI dossier', 'spark'],
              ['complaint', 'Complaint & evidence', 'file'],
              ['precedent', `Precedent${ai ? ` · ${ai.similarity.duplicates.length + ai.similarity.similar.length + ai.similarity.history.length}` : ''}`, 'history'],
              ['timeline', `Timeline · ${c.events.length}`, 'log'],
            ] as [Tab, string, any][]).map(([k, l, icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon name={icon} size={14} />{l}</button>
            ))}
          </div>
          {tab === 'complaint' && <ComplaintTab c={c} ai={ai} />}
          {tab === 'dossier' && (c.analyzing || !ai ? (
            <section className="sheet"><SheetHead fig="LIVE" title={c.analyzing ? 'Analysis in progress' : 'No analysis'} icon="spark" right={c.analyzing ? <span className="spinner" /> : undefined} /><div className="sheet-body"><PipelineTrace live={stages[c.id]} analyzing={c.analyzing} /></div></section>
          ) : <Dossier ai={ai} />)}
          {tab === 'precedent' && ai && <Precedent ai={ai} c={c} />}
          {tab === 'precedent' && !ai && <p className="muted small">No analysis available.</p>}
          {tab === 'timeline' && (
            <section className="sheet">
              <SheetHead fig="T" title="Conversation & history" />
              <div className="sheet-body col gap-24">
                <CommentBox c={c} staff />
                <Timeline events={c.events} staff />
                {!!c.corrections?.length && (
                  <div className="col gap-8">
                    <span className="label">Corrections recorded for learning (FR25)</span>
                    {c.corrections.map((k, i) => (
                      <div key={i} className="factor"><span><b className="mono xs">{k.field}</b> <s className="dim">{k.aiValue ?? '—'}</s> → <span className="accent">{k.finalValue}</span></span><span className="xs muted">{k.actor} · {k.source}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="col gap-16 verify-panel">
          {c.permissions.canVerify && tax.data && <VerifyPanel c={c} ai={ai} tax={tax.data} />}
          {c.status === 'awaiting_verification' && !admin && <div className="callout info"><Icon name="shield" /><span>Being verified by the grievance cell.</span></div>}
          {c.permissions.canUpdateStatus && <WorkPanel c={c} ai={ai} tax={tax.data} />}
          <FactsPanel c={c} />
        </aside>
      </div>
    </div>
  );
}

/* ═══ Complaint tab ═══════════════════════════════════════════════ */

function ComplaintTab({ c, ai }: { c: ComplaintDetail; ai: Analysis | null }) {
  const translated = c.bodyEnglish && c.translationMethod && c.translationMethod !== 'none';
  return (
    <div className="col gap-16">
      <section className="sheet">
        <SheetHead fig="A" title="Statement" right={c.language && <span className="tag">{LANG_LABEL[c.language]}{ai?.language.romanized ? ' · romanised' : ''}</span>} />
        <div className={`sheet-body grid ${translated ? 'g-2' : ''}`}>
          <div className="col gap-8">
            <span className="label">Original</span>
            <div className={`quote-block${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`} lang={c.language ?? undefined}>{c.body}</div>
          </div>
          {translated && (
            <div className="col gap-8">
              <span className="label">English · {c.translationMethod === 'openai' ? 'neural translation' : 'glossary (approximate)'}</span>
              <div className="quote-block en">{c.bodyEnglish}</div>
              {ai?.translation.notes && <span className="xs muted">{ai.translation.notes}</span>}
            </div>
          )}
        </div>
      </section>
      <section className="sheet">
        <SheetHead fig="B" title="Citizen-provided details" />
        <div className="sheet-body">
          <dl className="kv">
            <dt>Locality</dt><dd>{c.locationInput || <span className="dim">—</span>}</dd>
            <dt>District</dt><dd>{c.districtInput || <span className="dim">Not specified</span>}</dd>
            <dt>PIN code</dt><dd className="mono">{c.pincode || <span className="dim">—</span>}</dd>
            <dt>Incident date</dt><dd>{c.incidentDate ? dateShort(c.incidentDate) : <span className="dim">—</span>}</dd>
          </dl>
        </div>
      </section>
      <section className="sheet">
        <SheetHead fig="C" title="Evidence" right={<span className="label">FR4 · {c.attachments.length} files</span>} />
        <div className="sheet-body"><Attachments c={c} /></div>
      </section>
    </div>
  );
}

/* ═══ AI dossier ═════════════════════════════════════════════════ */

function Dossier({ ai }: { ai: Analysis }) {
  const evidence = new Set(ai.classification.evidence.flatMap((e) => e.toLowerCase().split(/\s+/)));
  const cls = ai.classification;
  return (
    <div className="col gap-16">
      <section className="sheet">
        <SheetHead fig="D-0" title="Pipeline trace" icon="route" right={<span className="xs muted">{(ai.totalMs / 1000).toFixed(2)}s · {dateTime(ai.finishedAt)}</span>} />
        <div className="sheet-body"><PipelineTrace trace={ai.trace} /></div>
      </section>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FR5·6" title="Language & translation" icon="translate" />
          <div className="sheet-body col gap-12">
            <div className="row between"><span className="h3">{ai.language.label}{ai.language.romanized ? ' (romanised)' : ''}</span><span className="num small">{pct(ai.language.confidence)}</span></div>
            {(['telugu', 'devanagari', 'latin'] as const).map((s) => (
              <div key={s} className="row gap-10 xs">
                <span className="muted" style={{ width: 74 }}>{s === 'devanagari' ? 'Devanagari' : s === 'telugu' ? 'Telugu' : 'Latin'}</span>
                <div className="simbar"><i style={{ width: `${ai.language.scripts[s] * 100}%`, ['--c' as string]: 'var(--ink-3)' }} /></div>
                <span className="num" style={{ width: 34, textAlign: 'right' }}>{pct(ai.language.scripts[s])}</span>
              </div>
            ))}
            <div className="xs muted">Detected via <span className="mono">{ai.language.method}</span>{ai.language.aiConfirmed ? ' · confirmed by model' : ''}. Translation: <b className="ink2">{ai.translation.method === 'none' ? 'not needed' : ai.translation.method}</b>{ai.translation.coverage != null && ai.translation.method === 'glossary' ? ` (${pct(ai.translation.coverage)} coverage)` : ''}.</div>
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FR7" title="Preprocessing" icon="hash" />
          <div className="sheet-body col gap-12">
            <div className="grid g-3" style={{ gap: 8 }}>
              {([['Tokens', ai.preprocess.stats.tokens], ['Terms', ai.preprocess.stats.terms], ['Unique', ai.preprocess.stats.unique], ['Stop-words', ai.preprocess.stats.stopwordsRemoved], ['Sentences', ai.preprocess.stats.sentences], ['PII masked', ai.preprocess.stats.piiMasked]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 18 }}>{v}</span><span className="label" style={{ fontSize: 9 }}>{l}</span></div>
              ))}
            </div>
            <div className="tokens" style={{ maxHeight: 110, overflow: 'auto' }}>
              {ai.preprocess.terms.slice(0, 60).map((t, i) => <span key={i} className={evidence.has(t) || cls.local.evidence.includes(t) ? 'ev' : ''}>{t}</span>)}
            </div>
          </div>
        </section>
      </div>

      <section className="sheet">
        <SheetHead fig="FR8·9·10" title="Classification & confidence" icon="target" right={<span className="tag">{cls.llm ? 'LLM + Naive Bayes' : 'Naive Bayes'}</span>} />
        <div className="sheet-body grid" style={{ gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          <div className="col center gap-8">
            <Gauge value={ai.confidence.score} label={`${ai.confidence.level} confidence`} />
            {ai.confidence.needsReview && <span className="chip" style={{ ['--c' as string]: 'var(--ochre)' }}>Needs careful review</span>}
          </div>
          <div className="col gap-16" style={{ minWidth: 0 }}>
            <div className="col gap-6">
              <DomainTag domain={cls.domain} />
              <span className="h2">{labelOf(cls.category)}</span>
              <p className="small ink2" style={{ lineHeight: 1.6 }}>{cls.rationale}</p>
              {cls.evidence.length > 0 && <div className="tokens">{cls.evidence.map((e) => <span key={e} className="ev">“{e}”</span>)}</div>}
            </div>
            <div className="col gap-8">
              <span className="label">Runner-up categories</span>
              {[{ category: cls.category, confidence: cls.confidence, domain: cls.domain }, ...cls.alternatives].map((a, i) => (
                <div key={a.category + i} className="row gap-10 xs">
                  <span className={i === 0 ? '' : 'muted'} style={{ width: 200, fontWeight: i === 0 ? 600 : 400 }}>{labelOf(a.category)}</span>
                  <div className="simbar"><i style={{ width: `${a.confidence * 100}%`, ['--c' as string]: i === 0 ? 'var(--lichen)' : 'var(--line-4)' }} /></div>
                  <span className="num" style={{ width: 36, textAlign: 'right' }}>{pct(a.confidence)}</span>
                </div>
              ))}
            </div>
            {cls.llm && (
              <div className="row wrap gap-8 small">
                <span className="label">Engines</span>
                <span className="tag tag-accent">GPT · {labelOf(cls.llm.category)}</span>
                <span className="tag">NB · {labelOf(cls.local.category)} {pct(cls.local.confidence)}</span>
                <span className="chip" style={{ ['--c' as string]: cls.agreement === 'full' ? 'var(--verdigris)' : cls.agreement === 'domain' ? 'var(--ochre)' : 'var(--oxide)' }}>{cls.agreement === 'full' ? 'Agree' : cls.agreement === 'domain' ? 'Domain only' : 'Disagree'}</span>
              </div>
            )}
            <div className="col">
              <span className="label mb-8">Confidence signals</span>
              {ai.confidence.signals.map((s) => (
                <div key={s.label} className="factor">
                  <span className="ink2">{s.label}</span>
                  <span className="row gap-10"><span className="muted">{s.value}</span><span className="num xs" style={{ width: 40, textAlign: 'right', color: s.effect > 0 ? 'var(--verdigris)' : s.effect < 0 ? 'var(--oxide)' : 'var(--ink-4)' }}>{s.effect > 0 ? '+' : ''}{s.effect ? Math.round(s.effect * 100) : '·'}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FR11" title="Severity" icon="alert" right={<span className="tag">{ai.severity.source}</span>} />
          <div className="sheet-body col gap-12">
            <div className="row gap-12"><Severity level={ai.severity.level} lg /></div>
            <p className="xs muted">{ai.severity.justification}</p>
            <div className="col">
              {ai.severity.factors.map((f, i) => <div key={i} className="factor"><span className="ink2">{f.label}</span>{f.weight ? <span className="num xs muted">+{f.weight}</span> : null}</div>)}
            </div>
            <ContextChips ai={ai} />
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FR12" title="Priority score" icon="scale" right={<PriorityStamp p={ai.priority.priority} />} />
          <div className="sheet-body col gap-12">
            <div className="col gap-6">
              <div className="row between"><span className="num" style={{ fontSize: 30, letterSpacing: '-0.04em' }}>{ai.priority.score}<span className="small muted">/100</span></span><span className="xs muted">P1 ≥ 85 · P2 ≥ 62 · P3 ≥ 40</span></div>
              <div style={{ position: 'relative', height: 8, borderRadius: 2, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
                {[40, 62, 85].map((t) => <span key={t} style={{ position: 'absolute', left: `${t}%`, top: 0, bottom: 0, width: 1, background: 'var(--line-3)' }} />)}
                <span style={{ position: 'absolute', inset: 0, width: `${ai.priority.score}%`, background: { P1: 'var(--oxide)', P2: 'var(--clay)', P3: 'var(--ochre)', P4: 'var(--moss)' }[ai.priority.priority] }} />
              </div>
            </div>
            <div className="col">
              {ai.priority.breakdown.map((b) => <div key={b.label} className="factor"><span className="ink2">{b.label}</span><span className="num xs">+{b.points}</span></div>)}
            </div>
          </div>
        </section>
      </div>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FR13" title="Location" icon="pin" right={<span className="tag">{ai.location.source}</span>} />
          <div className="sheet-body">
            <dl className="kv">
              <dt>Locality</dt><dd>{ai.location.locality ?? ai.location.text ?? '—'}</dd>
              <dt>District</dt><dd>{ai.location.district ?? <span style={{ color: 'var(--ochre)' }}>Not identified</span>}</dd>
              <dt>State</dt><dd>{ai.location.state ?? '—'}</dd>
              <dt>PIN</dt><dd className="mono">{ai.location.pincode ?? '—'}</dd>
              <dt>Confidence</dt><dd className="num">{pct(ai.location.confidence)}</dd>
              {ai.location.mentions.length > 0 && <><dt>Mentions</dt><dd><div className="tokens">{ai.location.mentions.map((m) => <span key={m}>{m}</span>)}</div></dd></>}
            </dl>
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FR14" title="Routing" icon="route" />
          <div className="sheet-body col gap-12">
            <span className="h3">{ai.routing.departmentName}</span>
            <span className="small muted">{ai.routing.office}</span>
            <div className="col">{ai.routing.reasons.map((r) => <div key={r} className="factor"><span className="ink2">{r}</span></div>)}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ContextChips({ ai }: { ai: Analysis }) {
  const c = ai.context;
  const chips: [string, string, string][] = [
    ...c.lifeSafety.map((x) => ['Safety', x, 'var(--oxide)'] as [string, string, string]),
    ...c.vulnerable.map((x) => ['Vulnerable', x, 'var(--clay)'] as [string, string, string]),
    ...c.scale.map((x) => ['Scale', x, 'var(--ochre)'] as [string, string, string]),
    ...c.essential.map((x) => ['Essential', x, 'var(--verdigris)'] as [string, string, string]),
  ];
  return (
    <div className="col gap-8">
      <span className="label">Context signals</span>
      <div className="row wrap gap-6">
        {chips.length ? chips.slice(0, 10).map(([k, v], i) => <span key={i} className="chip" style={{ ['--c' as string]: chips[i][2] }}>{k}: {v}</span>) : <span className="xs muted">None detected</span>}
        {c.durationDays != null && <span className="chip chip-plain">~{c.durationDays} days</span>}
        {c.sentiment && <span className="chip chip-plain">Tone: {c.sentiment}</span>}
        <span className="chip chip-plain">Scope: {c.scope.replace('_', ' ')}</span>
      </div>
    </div>
  );
}

/* ═══ Precedent (FR16–18) ══════════════════════════════════════ */

function Precedent({ ai, c }: { ai: Analysis; c: ComplaintDetail }) {
  const s = ai.similarity;
  const r = ai.recommendation;
  return (
    <div className="col gap-16">
      <section className="sheet accent-edge">
        <SheetHead fig="FR18" title="Recommended resolution" icon="bolt" right={<span className="tag">{r.source === 'openai' ? 'GPT synthesis' : 'Playbook + precedent'}</span>} />
        <div className="sheet-body col gap-12">
          <div className="row gap-16 wrap">
            <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 26 }}>~{r.expectedDays}<span className="small muted"> days</span></span><span className="label">Expected</span></div>
            <p className="small ink2 grow" style={{ minWidth: 220 }}>{r.rationale}</p>
          </div>
          <div>{r.actions.map((a, i) => <div key={i} className="action-step"><span className="n">{['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'][i]}</span><span>{a}</span></div>)}</div>
          {r.referenced.length > 0 && <div className="row wrap gap-6"><span className="label">Cites</span>{r.referenced.map((ref) => <span key={ref} className="tag">{ref}</span>)}</div>}
        </div>
      </section>

      <MatchList title="Possible duplicates" fig="FR16" icon="merge" items={s.duplicates} threshold={s.thresholds.duplicate} tone="var(--ochre)" dup empty="No complaint crosses the duplicate threshold." c={c} />
      <MatchList title="Related open complaints" fig="FR16" icon="layers" items={s.similar} threshold={s.thresholds.similar} empty="No related open complaints." c={c} />
      <MatchList title="Resolved precedents" fig="FR17" icon="history" items={s.history} threshold={s.thresholds.similar} tone="var(--verdigris)" empty="No resolved precedents found." c={c} history />
      <p className="xs muted">Engine: <span className="mono">{s.engine}</span> · searched {s.corpusSize} records · duplicate ≥ {pct(s.thresholds.duplicate)}, related ≥ {pct(s.thresholds.similar)}{s.fallbackReason ? ` · fell back: ${s.fallbackReason}` : ''}</p>
    </div>
  );
}

function MatchList({ title, fig, icon, items, threshold, tone = 'var(--lichen)', empty, dup, history, c }: { title: string; fig: string; icon: any; items: Match[]; threshold: number; tone?: string; empty: string; dup?: boolean; history?: boolean; c: ComplaintDetail }) {
  const { user } = useSession();
  return (
    <section className="sheet">
      <SheetHead fig={fig} title={title} icon={icon} right={<span className="label">{items.length}</span>} />
      <div className="sheet-body col gap-8">
        {!items.length && <p className="small muted">{empty}</p>}
        {items.map((m) => (
          <Link key={m.id} to={`${caseBase(user!.role)}${m.id}`} className={`match-card${dup ? ' dup' : ''}`}>
            <div className="row gap-8 wrap">
              <span className="mono xs muted">{m.ref}</span>
              <StatusChip status={m.status} />
              {m.sameUser && <span className="chip" style={{ ['--c' as string]: 'var(--clay)' }}>Same citizen</span>}
              {m.district && m.district === c.district && <span className="chip chip-plain">Same district</span>}
              <span className="grow" />
              <span className="num xs" style={{ color: tone }}>{pct(m.similarity)}</span>
            </div>
            <span className="small" style={{ fontWeight: 550 }}>{m.title}</span>
            {m.reason && dup && <span className="xs" style={{ color: 'var(--ochre)' }}>{m.reason}</span>}
            <div className="row gap-8"><div className="simbar"><i style={{ width: `${m.similarity * 100}%`, ['--c' as string]: tone }} /><span className="thr" style={{ left: `${threshold * 100}%` }} /></div></div>
            {history && m.resolutionNote && <p className="xs ink2" style={{ lineHeight: 1.55 }}><b className="muted">Resolved{m.resolvedInDays != null ? ` in ${m.resolvedInDays}d` : ''}{m.rating ? ` · rated ${m.rating}/5` : ''}:</b> {m.resolutionNote}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ═══ Verification panel (FR19, FR20, FR15) ═════════════════════ */

function VerifyPanel({ c, ai, tax }: { c: ComplaintDetail; ai: Analysis | null; tax: Taxonomy }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const initial = useMemo(() => ({
    domain: (ai?.classification.domain ?? c.domain ?? 'public_service') as Domain,
    category: ai?.classification.category ?? c.category ?? '',
    severity: ai?.severity.level ?? c.severity ?? 3,
    priority: (ai?.priority.priority ?? c.priority ?? 'P3') as Priority,
    departmentId: ai?.routing.departmentId ?? c.department?.id ?? 0,
    district: ai?.location.district ?? c.district ?? '',
    locationText: ai?.location.text || c.locationText || '',
    note: '',
    citizenMessage: ai?.recommendation.citizenMessage ?? '',
  }), [ai, c]);
  const [v, setV] = useState(initial);
  const [deptTouched, setDeptTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mergeOpen, setMergeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  useEffect(() => setV(initial), [initial]);

  // Changing category re-routes to its owning department unless the reviewer chose one explicitly.
  useEffect(() => {
    if (deptTouched) return;
    const cat = tax.categories.find((x) => x.key === v.category);
    const dept = cat && tax.departments.find((d) => d.code === cat.dept);
    if (dept && dept.id !== v.departmentId) setV((x) => ({ ...x, departmentId: dept.id }));
  }, [v.category]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = tax.categories.filter((x) => x.domain === v.domain);
  const deptCode = tax.departments.find((d) => d.id === v.departmentId)?.code;
  const changed = {
    domain: !!ai && v.domain !== ai.classification.domain,
    category: !!ai && v.category !== ai.classification.category,
    severity: !!ai && v.severity !== ai.severity.level,
    priority: !!ai && v.priority !== ai.priority.priority,
    department: !!ai && deptCode !== ai.routing.departmentCode,
    district: !!ai && (v.district || '') !== (ai.location.district ?? ''),
  };
  const nChanged = Object.values(changed).filter(Boolean).length;

  const verify = useMutation({
    mutationFn: () => api.post<{ complaint: ComplaintDetail; corrections: string[] }>(`/complaints/${c.id}/verify`, v),
    onSuccess: (r) => {
      qc.setQueryData(['complaint', c.id], r.complaint);
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      toast.push({ title: `${c.ref} assigned to ${r.complaint.department?.code}`, body: r.corrections.length ? `${r.corrections.length} correction(s) recorded for model learning.` : 'AI analysis confirmed as-is.', tone: 'success' });
      navigate('/admin/queue');
    },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fields); toast.error(e); },
  });
  const reanalyze = useMutation({
    mutationFn: () => api.post(`/complaints/${c.id}/reanalyze`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['complaint', c.id] }); toast.push({ title: 'Re-analysis started', tone: 'info' }); },
    onError: (e) => toast.error(e),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/reject`, { reason }),
    onSuccess: (r) => { qc.setQueryData(['complaint', c.id], r.complaint); qc.invalidateQueries({ queryKey: ['complaints'] }); setRejectOpen(false); toast.push({ title: `${c.ref} not accepted`, tone: 'info' }); },
    onError: (e) => toast.error(e),
  });

  const Was = ({ show, children }: { show: boolean; children: React.ReactNode }) => show ? <span className="ai-was">AI suggested <s>{children}</s> <span className="override">override</span></span> : null;

  return (
    <section className="sheet reg" style={{ borderColor: 'var(--lichen-line)' }}>
      <SheetHead fig="FR19·20" title="Verify & assign" icon="shield" right={nChanged ? <span className="chip" style={{ ['--c' as string]: 'var(--ochre)' }}>{nChanged} override{nChanged > 1 ? 's' : ''}</span> : <span className="chip" style={{ ['--c' as string]: 'var(--verdigris)' }}>Matches AI</span>} />
      <div className="sheet-body col gap-16">
        <div className="ai-field">
          <span className="field-label">Domain</span>
          <Segmented<Domain> value={v.domain} onChange={(d) => setV((x) => ({ ...x, domain: d, category: tax.categories.find((k) => k.domain === d)?.key ?? '' }))} options={tax.domains.map((d) => ({ value: d.key, label: d.label.replace(' Service', '') }))} />
          <Was show={changed.domain}>{ai?.classification.domain}</Was>
        </div>
        <div className="ai-field">
          <Field label="Category" error={errors.category}>
            <select className="select" value={v.category} onChange={(e) => setV((x) => ({ ...x, category: e.target.value }))}>
              {cats.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Field>
          <Was show={changed.category}>{labelOf(ai?.classification.category)}</Was>
        </div>
        <div className="ai-field">
          <span className="field-label">Severity</span>
          <div className="seg" role="group" style={{ alignSelf: 'flex-start' }}>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={v.severity === n} onClick={() => setV((x) => ({ ...x, severity: n }))} style={v.severity === n ? { color: `var(--sev-${n})` } : undefined}>{n}</button>)}
          </div>
          <span className="xs muted">{SEV_LABEL[v.severity]}</span>
          <Was show={changed.severity}>{ai?.severity.level} · {SEV_LABEL[ai?.severity.level ?? 0]}</Was>
        </div>
        <div className="ai-field">
          <span className="field-label">Priority</span>
          <Segmented<Priority> value={v.priority} onChange={(p) => setV((x) => ({ ...x, priority: p }))} options={(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => ({ value: p, label: p }))} />
          <Was show={changed.priority}>{ai?.priority.priority}</Was>
        </div>
        <div className="ai-field">
          <Field label="Department" error={errors.departmentId}>
            <select className="select" value={v.departmentId} onChange={(e) => { setDeptTouched(true); setV((x) => ({ ...x, departmentId: Number(e.target.value) })); }}>
              {tax.departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </Field>
          <Was show={changed.department}>{ai?.routing.departmentCode}</Was>
        </div>
        <div className="grid g-2" style={{ gap: 10 }}>
          <div className="ai-field">
            <Field label="District" error={errors.district}>
              <select className="select" value={v.district} onChange={(e) => setV((x) => ({ ...x, district: e.target.value }))}>
                <option value="">Unknown</option>
                {tax.districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
            <Was show={changed.district}>{ai?.location.district || 'none'}</Was>
          </div>
          <Field label="Locality"><input className="input" value={v.locationText} onChange={(e) => setV((x) => ({ ...x, locationText: e.target.value }))} /></Field>
        </div>
        <Field label="Message to citizen" hint="Sent with the assignment notification.">
          <textarea className="textarea" style={{ minHeight: 80 }} value={v.citizenMessage} maxLength={600} onChange={(e) => setV((x) => ({ ...x, citizenMessage: e.target.value }))} />
        </Field>
        <Field label={nChanged ? 'Why the correction? (teaches the model)' : 'Internal note'} optional>
          <textarea className="textarea" style={{ minHeight: 64 }} value={v.note} maxLength={1000} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} placeholder={nChanged ? 'e.g. Sparking transformer is an electrical hazard, not school infrastructure.' : ''} />
        </Field>
        <Button variant="primary" size="lg" block icon="check" loading={verify.isPending} onClick={() => verify.mutate()}>
          Verify & assign to {deptCode ?? '…'}
        </Button>
        <div className="row gap-8 wrap">
          <Button size="sm" icon="merge" onClick={() => setMergeOpen(true)}>Merge duplicate</Button>
          <Button size="sm" icon="refresh" loading={reanalyze.isPending} onClick={() => reanalyze.mutate()}>Re-analyse</Button>
          <span className="grow" />
          <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>Reject</Button>
        </div>
        {nChanged > 0 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setV(initial); setDeptTouched(false); }}><Icon name="undo" /> Reset to AI suggestion</button>}
      </div>
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} c={c} suggestion={ai?.similarity.duplicates[0]?.ref ?? ai?.similarity.similar[0]?.ref ?? ''} />
      <ConfirmDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => reject.mutate(reason)}
        busy={reject.isPending}
        danger
        title={`Reject ${c.ref}?`}
        body="The citizen will be told this complaint cannot be accepted, with your reason. This closes the case permanently."
        reason
        reasonMin={10}
        reasonLabel="Reason shown to the citizen"
        reasonPlaceholder="e.g. This is a private dispute outside the scope of public services. Please approach…"
        confirmLabel="Reject complaint"
      />
    </section>
  );
}

function MergeDialog({ open, onClose, c, suggestion }: { open: boolean; onClose: () => void; c: ComplaintDetail; suggestion: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [original, setOriginal] = useState(suggestion);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setOriginal(suggestion); setErr(''); } }, [open, suggestion]);
  const m = useMutation({
    mutationFn: () => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/merge`, { original, note }),
    onSuccess: (r) => { qc.setQueryData(['complaint', c.id], r.complaint); qc.invalidateQueries({ queryKey: ['complaints'] }); onClose(); toast.push({ title: `${c.ref} merged into ${original}`, tone: 'success' }); },
    onError: (e) => setErr(e instanceof ApiError ? e.fields.original ?? e.message : 'Failed'),
  });
  return (
    <Modal open={open} onClose={onClose} eyebrow="FR16 · Duplicate handling" title="Merge into an existing complaint" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="merge" loading={m.isPending} disabled={!original.trim()} onClick={() => m.mutate()}>Merge</Button></>}>
      <div className="col gap-16">
        <p className="small ink2">{c.ref} will be closed as a duplicate and linked to the original. The citizen is notified and can follow progress there.</p>
        <Field label="Original complaint reference" error={err}><input className="input mono" value={original} onChange={(e) => setOriginal(e.target.value.toUpperCase())} placeholder="PLB-2609-00034" /></Field>
        <Field label="Note" optional><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ═══ Department work panel (FR22) ══════════════════════════════ */

function WorkPanel({ c, ai, tax }: { c: ComplaintDetail; ai: Analysis | null; tax?: Taxonomy }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<null | 'hold' | 'resolve' | 'return' | 'reassign' | 'escalate'>(null);
  const [text, setText] = useState('');
  const [cat, setCat] = useState('');
  const [dept, setDept] = useState(0);
  const [err, setErr] = useState('');
  const done = (r: { complaint?: ComplaintDetail }, title: string) => {
    if (r.complaint) qc.setQueryData(['complaint', c.id], r.complaint);
    qc.invalidateQueries({ queryKey: ['complaints'] });
    qc.invalidateQueries({ queryKey: ['counts'] });
    setMode(null); setText(''); setErr('');
    toast.push({ title, tone: 'success' });
  };
  const fail = (e: unknown) => setErr(e instanceof ApiError ? Object.values(e.fields)[0] ?? e.message : 'Failed');
  const status = useMutation({
    mutationFn: (s: { status: string; message?: string; resolutionNote?: string }) => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/status`, s),
    onSuccess: (r, s) => done(r, `${c.ref} → ${STATUS_LABEL[s.status as 'resolved']}`),
    onError: fail,
  });
  const ret = useMutation({
    mutationFn: () => api.post(`/complaints/${c.id}/return`, { reason: text, suggestedCategory: cat }),
    onSuccess: () => { done({}, `${c.ref} returned to the grievance cell`); navigate('/desk/cases'); },
    onError: fail,
  });
  const reassign = useMutation({ mutationFn: () => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/reassign`, { departmentId: dept, note: text }), onSuccess: (r) => done(r, 'Transferred'), onError: fail });
  const escalate = useMutation({ mutationFn: () => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/escalate`, { reason: text }), onSuccess: (r) => done(r, 'Escalated'), onError: fail });

  const canStart = ['assigned', 'on_hold', 'reopened'].includes(c.status);
  return (
    <section className="sheet reg" style={{ borderColor: 'var(--lichen-line)' }}>
      <SheetHead fig="FR22" title="Work this case" icon="bolt" />
      <div className="sheet-body col gap-12">
        {mode === null && (
          <>
            {canStart && <Button variant="primary" icon="play" loading={status.isPending} onClick={() => status.mutate({ status: 'in_progress' })}>{c.status === 'on_hold' ? 'Resume work' : 'Start work'}</Button>}
            <Button variant={canStart ? 'default' : 'primary'} icon="check" onClick={() => { setMode('resolve'); setText(''); }}>Mark resolved…</Button>
            {c.status !== 'on_hold' && <Button icon="pause" onClick={() => setMode('hold')}>Put on hold…</Button>}
            <div className="row gap-8 wrap">
              {c.permissions.canReturn && <Button size="sm" variant="ghost" icon="undo" onClick={() => setMode('return')}>Not ours — return</Button>}
              {c.permissions.canReassign && <Button size="sm" variant="ghost" icon="route" onClick={() => { setMode('reassign'); setDept(0); }}>Transfer</Button>}
              {c.permissions.canEscalate && <Button size="sm" variant="ghost" icon="alert" onClick={() => setMode('escalate')}>Escalate</Button>}
            </div>
          </>
        )}
        {mode === 'resolve' && (
          <>
            <Field label="What was done?" error={err} hint="Shown to the citizen and used as precedent for future cases (FR17).">
              <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the fix, who did it and any follow-up." />
            </Field>
            {ai && ai.recommendation.actions.length > 0 && !text && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setText(ai.recommendation.actions.slice(0, 3).join('. ') + '.')}><Icon name="spark" /> Draft from recommendation</button>
            )}
            <div className="row gap-8"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="primary" icon="check" loading={status.isPending} onClick={() => status.mutate({ status: 'resolved', resolutionNote: text })}>Resolve & notify citizen</Button></div>
          </>
        )}
        {mode === 'hold' && (
          <>
            <Field label="Why is work on hold?" error={err} hint="The citizen sees this message."><textarea className="textarea" style={{ minHeight: 80 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Waiting for transformer delivery, expected Thursday." /></Field>
            <div className="row gap-8"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button icon="pause" loading={status.isPending} onClick={() => status.mutate({ status: 'on_hold', message: text })}>Put on hold</Button></div>
          </>
        )}
        {mode === 'return' && (
          <>
            <p className="xs muted">The case goes back to the grievance cell for re-routing. Your reason is recorded as a correction so routing improves.</p>
            <Field label="Why isn't this your department?" error={err}><textarea className="textarea" style={{ minHeight: 80 }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <Field label="Suggested category" optional>
              <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">—</option>
                {tax?.categories.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </Field>
            <div className="row gap-8"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="danger" icon="undo" loading={ret.isPending} onClick={() => ret.mutate()}>Return to cell</Button></div>
          </>
        )}
        {mode === 'reassign' && (
          <>
            <Field label="Transfer to" error={err}>
              <select className="select" value={dept} onChange={(e) => setDept(Number(e.target.value))}>
                <option value={0}>Choose department…</option>
                {tax?.departments.filter((d) => d.active && d.id !== c.department?.id).map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </Field>
            <Field label="Note" optional><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <div className="row gap-8"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="primary" icon="route" disabled={!dept} loading={reassign.isPending} onClick={() => reassign.mutate()}>Transfer</Button></div>
          </>
        )}
        {mode === 'escalate' && (
          <>
            <Field label="Reason for escalation" error={err}><input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Department unresponsive for 3 days" /></Field>
            <div className="row gap-8"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="danger" icon="alert" loading={escalate.isPending} onClick={() => escalate.mutate()}>Escalate to L{c.escalationLevel + 1}</Button></div>
          </>
        )}
        {user!.role === 'officer' && mode === null && ai?.recommendation && (
          <div className="callout"><Icon name="spark" /><span><b style={{ color: 'var(--ink-1)' }}>Suggested first step:</b> {ai.recommendation.actions[0]}</span></div>
        )}
      </div>
    </section>
  );
}

/* ═══ Facts ══════════════════════════════════════════════════════ */

function FactsPanel({ c }: { c: ComplaintDetail }) {
  return (
    <section className="sheet">
      <SheetHead title="Case facts" icon="file" />
      <div className="sheet-body col gap-16">
        <dl className="kv">
          <dt>Department</dt><dd>{c.department ? `${c.department.code} · ${c.department.name}` : <span className="dim">Not assigned</span>}</dd>
          <dt>Verified</dt><dd>{c.verifiedAt ? dateTime(c.verifiedAt) : <span className="dim">Pending</span>}</dd>
          {c.slaDueAt && <><dt>Deadline</dt><dd>{dateTime(c.slaDueAt)}</dd></>}
          {c.resolvedAt && <><dt>Resolved</dt><dd>{dateTime(c.resolvedAt)}</dd></>}
          {c.escalationReason && <><dt>Escalation</dt><dd className="small" style={{ color: 'var(--oxide)' }}>{c.escalationReason}</dd></>}
          {c.reopenCount > 0 && <><dt>Reopened</dt><dd>{c.reopenCount}×</dd></>}
        </dl>
        {c.resolutionNote && <div className="quote-block en small">{c.resolutionNote}</div>}
        {c.feedback && (
          <div className="col gap-4">
            <span className="label">Citizen feedback</span>
            <span className="num" style={{ fontSize: 22, color: c.feedback.rating >= 4 ? 'var(--verdigris)' : c.feedback.rating <= 2 ? 'var(--oxide)' : 'var(--ochre)' }}>{c.feedback.rating}/5</span>
            {c.feedback.comment && <span className="small ink2">“{c.feedback.comment}”</span>}
          </div>
        )}
        <div className="ruler" />
        <div className="col gap-6">
          <span className="label">Citizen</span>
          <span className="small" style={{ fontWeight: 600 }}>{c.citizen?.name}</span>
          <a className="xs accent" href={`mailto:${c.citizen?.email}`}>{c.citizen?.email}</a>
          {c.citizen?.phone && <a className="xs muted mono" href={`tel:${c.citizen.phone}`}>{c.citizen.phone}</a>}
        </div>
      </div>
    </section>
  );
}

const CAT_LABELS: Record<string, string> = {};
function labelOf(key: string | null | undefined) {
  if (!key) return '—';
  return CAT_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
export function primeCategoryLabels(t: Taxonomy) {
  for (const c of t.categories) CAT_LABELS[c.key] = c.label;
}
