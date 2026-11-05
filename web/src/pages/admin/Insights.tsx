import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ago, dateTime, pct } from '../../lib/format';
import { Button, ErrorState, PageHead, SheetHead, Skeleton } from '../../components/ui';
import { BarList, Columns, Ring } from '../../components/Charts';
import { STAGES } from '../../components/Case';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

interface InsightsData {
  model: { examples: number; vocabulary: number; accuracy: number | null; trainedAt: string };
  versions: { id: number; examples: number; vocabulary: number; accuracy: number | null; trigger: string; actor: string | null; created_at: string }[];
  fieldStats: { field: string; corrected: number; total: number; accuracy: number | null }[];
  calibration: { label: string; n: number; accuracy: number | null }[];
  confusion: { from: string; to: string; n: number }[];
  corrections: { id: number; field: string; aiLabel: string | null; finalLabel: string; note: string; source: string; createdAt: string; actor: string | null; ref: string; complaintId: number }[];
  feedback: { histogram: { rating: number; n: number }[]; average: number | null; count: number; satisfiedPct: number | null; comments: { rating: number; satisfied: number; comment: string; createdAt: string; ref: string; complaintId: number; dept: string | null }[] };
  engines: { ai_engine: string; n: number }[];
  stages: { key: string; avgMs: number; runs: number; fallback: number }[];
  aiActive: boolean;
}

const FIELD_LABEL: Record<string, string> = { domain: 'Domain', category: 'Category', severity: 'Severity', priority: 'Priority', department: 'Department', district: 'District' };

export default function Insights() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api.get<InsightsData>('/admin/insights') });
  const retrain = useMutation({
    mutationFn: () => api.post<{ examples: number; accuracy: number | null }>('/admin/model/retrain'),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['insights'] }); toast.push({ title: 'Local model retrained', body: `${r.examples} examples · cross-validated accuracy ${pct(r.accuracy, 1)}`, tone: 'success' }); },
    onError: (e) => toast.error(e),
  });
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;

  return (
    <div className="col gap-20">
      <PageHead
        index="AI · 03"
        eyebrow="FR10 · FR24 · FR25 — Confidence, feedback & continuous improvement"
        title={<>The record, <em className="serif-i accent">learning.</em></>}
        sub="Every reviewer override and citizen rating is captured here. Corrections retrain the local classifier and are injected as precedent into the language model's prompt."
        actions={<Button variant="primary" icon="refresh" loading={retrain.isPending} onClick={() => retrain.mutate()}>Retrain local model</Button>}
      />

      <div className="grid g-3">
        <section className="sheet reg">
          <SheetHead fig="M" title="Local classifier" icon="cpu" right={<span className="tag">Naive Bayes</span>} />
          <div className="sheet-body">
            {d ? (
              <div className="row gap-20">
                <div style={{ position: 'relative' }}>
                  <Ring value={d.model.accuracy} size={78} stroke={5} color="var(--lichen)" />
                  <span className="num" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 15 }}>{d.model.accuracy != null ? `${Math.round(d.model.accuracy * 100)}%` : '—'}</span>
                </div>
                <dl className="kv" style={{ gridTemplateColumns: '90px 1fr', fontSize: 12.5 }}>
                  <dt>CV accuracy</dt><dd>{d.model.accuracy != null ? pct(d.model.accuracy, 1) : 'needs 8+ verified'}</dd>
                  <dt>Examples</dt><dd className="num">{d.model.examples}</dd>
                  <dt>Vocabulary</dt><dd className="num">{d.model.vocabulary}</dd>
                  <dt>Trained</dt><dd>{ago(d.model.trainedAt)}</dd>
                </dl>
              </div>
            ) : <Skeleton h={80} />}
          </div>
        </section>
        <section className="sheet reg">
          <SheetHead fig="E" title="Engines" icon="spark" right={<span className={`engine-pill${d?.aiActive ? '' : ' off'}`}><span className="dot" />{d?.aiActive ? 'OpenAI on' : 'OpenAI off'}</span>} />
          <div className="sheet-body col gap-10">
            {d?.engines.map((e) => (
              <div key={e.ai_engine} className="row between small"><span className="ink2">{e.ai_engine === 'openai' ? 'OpenAI (all stages)' : e.ai_engine === 'hybrid' ? 'Hybrid (partial fallback)' : 'Local NLP only'}</span><span className="num">{e.n}</span></div>
            ))}
            {!d?.aiActive && <Link to="/admin/settings" className="callout info" style={{ textDecoration: 'none' }}><Icon name="key" /><span>Add an OpenAI key in <b>System settings</b> for neural translation, LLM classification and embeddings.</span></Link>}
          </div>
        </section>
        <section className="sheet reg">
          <SheetHead fig="F" title="Citizen feedback" icon="star" right={<span className="label">FR24</span>} />
          <div className="sheet-body col gap-12">
            <div className="row gap-24">
              <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 32, letterSpacing: '-0.04em' }}>{d?.feedback.average ?? '—'}<span className="small muted">/5</span></span><span className="label">Average</span></div>
              <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 32, letterSpacing: '-0.04em' }}>{d?.feedback.satisfiedPct ?? '—'}<span className="small muted">%</span></span><span className="label">Satisfied</span></div>
              <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 32, letterSpacing: '-0.04em' }}>{d?.feedback.count ?? '—'}</span><span className="label">Ratings</span></div>
            </div>
          </div>
        </section>
      </div>

      <section className="sheet">
        <SheetHead fig="FIG. 1" title="AI accuracy by field · share of verified cases not corrected" />
        <div className="sheet-body grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          {(d?.fieldStats ?? []).map((f) => (
            <div key={f.field} className="row gap-12">
              <div style={{ position: 'relative' }}>
                <Ring value={f.accuracy == null ? null : f.accuracy / 100} size={54} stroke={4} color={(f.accuracy ?? 0) >= 90 ? 'var(--verdigris)' : (f.accuracy ?? 0) >= 75 ? 'var(--ochre)' : 'var(--oxide)'} />
              </div>
              <div className="col" style={{ gap: 0 }}>
                <span className="small" style={{ fontWeight: 600 }}>{FIELD_LABEL[f.field]}</span>
                <span className="num" style={{ fontSize: 18 }}>{f.accuracy ?? '—'}%</span>
                <span className="xs muted">{f.corrected} corrected / {f.total}</span>
              </div>
            </div>
          ))}
          {!d && <Skeleton h={60} />}
        </div>
      </section>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FIG. 2" title="Confidence calibration" right={<span className="xs muted">Is stated confidence honest?</span>} />
          <div className="sheet-body col gap-12">
            {d ? <Columns height={120} data={d.calibration.map((b) => ({ label: `${b.label} · n${b.n}`, value: b.accuracy ?? 0, tone: (b.accuracy ?? 0) >= 85 ? 'var(--verdigris)' : (b.accuracy ?? 0) >= 65 ? 'var(--ochre)' : 'var(--clay)' }))} /> : <Skeleton h={140} />}
            <p className="xs muted">Bars show observed category accuracy for each band of the model's own confidence. A well-calibrated model climbs left to right.</p>
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FIG. 3" title="Most common category corrections" />
          <div className="sheet-body col gap-8">
            {d && !d.confusion.length && <p className="small muted">No category corrections yet — the model has agreed with every reviewer.</p>}
            {d?.confusion.map((c, i) => (
              <div key={i} className="factor">
                <span className="row gap-8" style={{ minWidth: 0 }}><s className="dim ellipsis">{c.from}</s><Icon name="arrowRight" size={13} style={{ color: 'var(--ochre)', flex: 'none' }} /><span className="ink2 ellipsis">{c.to}</span></span>
                <span className="num xs">{c.n}×</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FIG. 4" title="Rating distribution" />
          <div className="sheet-body">
            {d ? <Columns height={110} data={d.feedback.histogram.map((h) => ({ label: `${h.rating}★`, value: h.n, tone: h.rating >= 4 ? 'var(--verdigris)' : h.rating === 3 ? 'var(--ochre)' : 'var(--oxide)' }))} /> : <Skeleton h={130} />}
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FIG. 5" title="Pipeline performance · avg per stage" />
          <div className="sheet-body">
            {d ? <BarList rows={STAGES.map((s) => { const x = d.stages.find((y) => y.key === s.key); return { label: `${s.fr} ${s.label}${x?.fallback ? ` · ${x.fallback} fallback` : ''}`, value: x?.avgMs ?? 0, color: x?.fallback ? 'var(--ochre)' : 'var(--lichen)' }; })} /> : <Skeleton h={200} />}
            <p className="xs muted mt-12">Milliseconds. Local stages run in single-digit ms; OpenAI stages typically take 0.5–3 s.</p>
          </div>
        </section>
      </div>

      <section className="sheet">
        <SheetHead fig="FIG. 6" title="What citizens said" right={<span className="xs muted">Lowest ratings first</span>} />
        <div>
          {d?.feedback.comments.map((c, i) => (
            <Link key={i} to={`/admin/c/${c.complaintId}`} className="list-item">
              <span className="stamp" style={{ ['--c' as string]: c.rating >= 4 ? 'var(--verdigris)' : c.rating === 3 ? 'var(--ochre)' : 'var(--oxide)' }}>{c.rating}★</span>
              <div className="col gap-4 grow"><span className="small ink2">“{c.comment}”</span><span className="label" style={{ fontSize: 9 }}>{c.ref} · {c.dept} · {ago(c.createdAt)}</span></div>
            </Link>
          ))}
          {d && !d.feedback.comments.length && <p className="small muted" style={{ padding: 18 }}>No written feedback yet.</p>}
        </div>
      </section>

      <section className="sheet">
        <SheetHead fig="LOG" title="Correction log · FR25" right={<span className="label">{d?.corrections.length ?? 0} recent</span>} />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Case</th><th>Field</th><th>AI said</th><th>Human set</th><th className="hide-sm">Source</th><th className="hide-sm">Note</th><th>When</th></tr></thead>
            <tbody>
              {d?.corrections.map((k) => (
                <tr key={k.id}>
                  <td><Link to={`/admin/c/${k.complaintId}`} className="ref accent">{k.ref}</Link></td>
                  <td className="mono xs">{k.field}</td>
                  <td className="small"><s className="dim">{k.aiLabel ?? '—'}</s></td>
                  <td className="small" style={{ color: 'var(--lichen)' }}>{k.finalLabel}</td>
                  <td className="hide-sm"><span className="tag">{k.source.replace('_', ' ')}</span></td>
                  <td className="hide-sm xs muted" style={{ maxWidth: 260 }}><span className="clamp-2">{k.note || '—'}</span></td>
                  <td className="xs muted nowrap">{ago(k.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d && !d.corrections.length && <p className="small muted" style={{ padding: 18 }}>No corrections recorded yet.</p>}
        </div>
      </section>

      <section className="sheet">
        <SheetHead fig="V" title="Model versions" />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Trigger</th><th>Examples</th><th>Vocabulary</th><th>CV accuracy</th><th>By</th><th>When</th></tr></thead>
            <tbody>
              {d?.versions.map((v) => (
                <tr key={v.id}><td className="num">{v.id}</td><td><span className="tag">{v.trigger}</span></td><td className="num">{v.examples}</td><td className="num">{v.vocabulary}</td><td className="num">{pct(v.accuracy, 1)}</td><td className="small muted">{v.actor ?? 'system'}</td><td className="xs muted">{dateTime(v.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
