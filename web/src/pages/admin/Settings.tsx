import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { Button, ErrorState, Field, PageHead, SheetHead, Skeleton, Switch } from '../../components/ui';
import { ConfirmDialog } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

interface S {
  openai_model: string; openai_embed_model: string; ai_enabled: boolean;
  sla_p1_hours: number; sla_p2_hours: number; sla_p3_hours: number; sla_p4_hours: number; verify_sla_hours: number;
  auto_escalate_p1: boolean; duplicate_threshold: number; similar_threshold: number; reopen_window_days: number;
  openai_key_set: boolean; openai_key_source: 'database' | 'environment' | 'none'; openai_key_hint: string;
}

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<S>('/admin/settings') });
  const [f, setF] = useState<S | null>(null);
  const [key, setKey] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<S>('/admin/settings', body),
    onSuccess: (s) => { qc.setQueryData(['settings'], s); qc.invalidateQueries({ queryKey: ['public-stats'] }); setKey(''); toast.push({ title: 'Settings saved', tone: 'success' }); },
    onError: (e) => toast.error(e),
  });
  const testIt = useMutation({
    mutationFn: () => api.post<{ ok: boolean; model: string; latencyMs: number }>('/admin/settings/test-openai'),
    onSuccess: (r) => setTest({ ok: true, msg: `Connected · ${r.model} · ${r.latencyMs} ms` }),
    onError: (e) => setTest({ ok: false, msg: e instanceof ApiError ? e.message : 'Failed' }),
  });

  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!f) return <div className="col gap-16"><Skeleton h={40} w={300} /><div className="sheet" style={{ height: 300 }} /></div>;
  const dirty = JSON.stringify(f) !== JSON.stringify(q.data);
  const num = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const { openai_key_set: _a, openai_key_source: _b, openai_key_hint: _c, ...payload } = f;

  return (
    <div className="col gap-20" style={{ maxWidth: 980 }}>
      <PageHead index="ADM · 06" eyebrow="System configuration" title={<>System <em className="serif-i accent">settings</em></>} />

      <section className="sheet reg">
        <SheetHead fig="AI" title="OpenAI integration" icon="spark" right={<span className={`engine-pill${f.openai_key_set && f.ai_enabled ? '' : ' off'}`}><span className="dot" />{f.openai_key_set ? (f.ai_enabled ? 'Active' : 'Key set · disabled') : 'Not configured'}</span>} />
        <div className="sheet-body col gap-16">
          <p className="small ink2" style={{ lineHeight: 1.6 }}>
            With a key, Plumbline uses the model for neural translation (FR6), classification with rationale (FR8–10), severity & location (FR11–13), embeddings for duplicate detection (FR16–17) and resolution synthesis (FR18).
            Without one, the built-in local NLP engine handles every stage. Any OpenAI failure falls back to local automatically.
          </p>
          <div className="row-top gap-12 wrap">
            <div className="grow" style={{ minWidth: 280 }}>
              <Field label="API key" hint={f.openai_key_set ? `Current key ${f.openai_key_hint} · from ${f.openai_key_source === 'database' ? 'this settings page' : '.env file'}` : 'Stored server-side; never sent back to the browser.'}>
                <input className="input mono" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={f.openai_key_set ? '•••••••• (leave blank to keep)' : 'sk-…'} />
              </Field>
            </div>
            <div className="row gap-8" style={{ marginTop: 26 }}>
              <Button variant="primary" icon="key" disabled={!key.trim()} loading={save.isPending && !!key} onClick={() => save.mutate({ openai_api_key: key.trim() })}>Save key</Button>
              <Button icon="bolt" disabled={!f.openai_key_set} loading={testIt.isPending} onClick={() => { setTest(null); testIt.mutate(); }}>Test</Button>
              {f.openai_key_source === 'database' && <Button variant="danger" onClick={() => setClearOpen(true)}>Remove</Button>}
            </div>
          </div>
          {test && <div className={`callout ${test.ok ? 'info' : 'danger'}`}><Icon name={test.ok ? 'check' : 'alert'} /><span>{test.msg}</span></div>}
          <div className="grid g-2">
            <Field label="Chat model" hint="Must support JSON-schema structured outputs."><input className="input mono" value={f.openai_model} onChange={(e) => setF({ ...f, openai_model: e.target.value })} /></Field>
            <Field label="Embedding model"><input className="input mono" value={f.openai_embed_model} onChange={(e) => setF({ ...f, openai_embed_model: e.target.value })} /></Field>
          </div>
          <label className="row gap-12"><Switch checked={f.ai_enabled} onChange={(v) => setF({ ...f, ai_enabled: v })} label="Use OpenAI" /><span className="small">Use OpenAI when a key is available</span></label>
        </div>
      </section>

      <section className="sheet">
        <SheetHead fig="FR23" title="Deadlines & escalation" icon="clock" />
        <div className="sheet-body col gap-16">
          <div className="grid g-4">
            {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => {
              const k = `sla_${p.toLowerCase()}_hours` as keyof S;
              return (
                <Field key={p} label={<span className="row gap-8"><span className={`stamp ${p}`} style={{ transform: 'none', height: 18, fontSize: 9.5 }}>{p}</span> deadline</span>} hint={`${Math.round(((f[k] as number) / 24) * 10) / 10} days`}>
                  <div className="input-wrap"><input className="input num" type="number" min={1} value={f[k] as number} onChange={num(k)} /><span className="suffix label">hrs</span></div>
                </Field>
              );
            })}
          </div>
          <div className="grid g-2">
            <Field label="Verification must happen within" hint="Complaints waiting longer are escalated to the cell."><div className="input-wrap"><input className="input num" type="number" min={1} value={f.verify_sla_hours} onChange={num('verify_sla_hours')} /><span className="suffix label">hrs</span></div></Field>
            <Field label="Citizen can reopen for" hint="After this, resolved cases close automatically."><div className="input-wrap"><input className="input num" type="number" min={1} value={f.reopen_window_days} onChange={num('reopen_window_days')} /><span className="suffix label">days</span></div></Field>
          </div>
          <label className="row gap-12"><Switch checked={f.auto_escalate_p1} onChange={(v) => setF({ ...f, auto_escalate_p1: v })} label="Auto-escalate P1" /><span className="small">Escalate P1 (urgent) complaints immediately on arrival</span></label>
        </div>
      </section>

      <section className="sheet">
        <SheetHead fig="FR16" title="Duplicate detection" icon="merge" />
        <div className="sheet-body grid g-2">
          <Field label={<>Duplicate threshold · <span className="num accent">{Math.round(f.duplicate_threshold * 100)}%</span></>} hint="Embedding cosine similarity. The local TF-IDF engine scales this automatically.">
            <input type="range" min={0.5} max={0.99} step={0.01} value={f.duplicate_threshold} onChange={(e) => setF({ ...f, duplicate_threshold: Number(e.target.value) })} style={{ accentColor: 'var(--lichen)' }} />
          </Field>
          <Field label={<>Related threshold · <span className="num accent">{Math.round(f.similar_threshold * 100)}%</span></>} hint="Minimum similarity to show as related or as a precedent.">
            <input type="range" min={0.1} max={0.9} step={0.01} value={f.similar_threshold} onChange={(e) => setF({ ...f, similar_threshold: Number(e.target.value) })} style={{ accentColor: 'var(--lichen)' }} />
          </Field>
        </div>
      </section>

      <div className="row gap-12" style={{ position: 'sticky', bottom: 16, zIndex: 5 }}>
        {dirty && (
          <div className="sheet raised row gap-12 rise" style={{ padding: '10px 14px', boxShadow: 'var(--shadow-2)' }}>
            <span className="small">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => setF(q.data!)}>Discard</Button>
            <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate(payload)}>Save settings</Button>
          </div>
        )}
      </div>
      <ConfirmDialog open={clearOpen} onClose={() => setClearOpen(false)} danger title="Remove the stored API key?" body="The system falls back to the .env key if one exists, otherwise to the local NLP engine." confirmLabel="Remove key" onConfirm={() => { save.mutate({ clear_openai_key: true }); setClearOpen(false); }} />
    </div>
  );
}
