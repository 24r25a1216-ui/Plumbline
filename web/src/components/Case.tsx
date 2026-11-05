import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ago, bytes, dateTime, dueIn, STATUS_LABEL } from '../lib/format';
import type { ComplaintDetail, ComplaintEvent, Status, TraceStage } from '../lib/types';
import type { StageEvent } from '../lib/live';
import { Icon, type IconName } from './Icon';
import { Button, Field } from './ui';
import { useToast } from './Toast';

/* ── Journey rail (FR21/22) ───────────────────────────────────── */

const JOURNEY: { key: string; label: string; statuses: Status[] }[] = [
  { key: 'submitted', label: 'Received', statuses: ['submitted'] },
  { key: 'analysed', label: 'Analysed', statuses: ['analyzing'] },
  { key: 'verified', label: 'Verified', statuses: ['awaiting_verification'] },
  { key: 'assigned', label: 'Assigned', statuses: ['assigned'] },
  { key: 'progress', label: 'In progress', statuses: ['in_progress', 'on_hold', 'reopened'] },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
];

export function JourneyRail({ status }: { status: Status }) {
  const stopped = ['withdrawn', 'rejected', 'merged'].includes(status);
  let idx = JOURNEY.findIndex((j) => j.statuses.includes(status));
  if (stopped) idx = 2;
  const n = JOURNEY.length;
  const progressPct = (idx / (n - 1)) * (100 - 100 / n);
  return (
    <div className="status-rail" style={{ ['--n' as string]: n }} role="list" aria-label="Complaint progress">
      <span className="progress" style={{ width: `${progressPct}%`, background: stopped ? 'var(--ink-4)' : undefined }} />
      {JOURNEY.map((j, i) => {
        const cls = stopped && i === idx ? 'stopped current' : i < idx ? 'done' : i === idx ? 'current' : '';
        return (
          <div key={j.key} className={`status-step ${cls}`} role="listitem" aria-current={i === idx ? 'step' : undefined}>
            {i === idx && !stopped && (
              <svg className="bob" viewBox="0 0 12 30" aria-hidden>
                <path d="M6 0v18" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
                <path d="M6 18 2.5 22 6 28l3.5-6z" fill="currentColor" />
              </svg>
            )}
            <span className="node" />
            <span>{stopped && i === idx ? STATUS_LABEL[status] : status === 'on_hold' && i === idx ? 'On hold' : status === 'reopened' && i === idx ? 'Reopened' : j.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Timeline ─────────────────────────────────────────────────── */

const EV_ICON: Record<string, IconName> = { status: 'check', comment: 'message', ai: 'spark', correction: 'scale', escalation: 'alert', feedback: 'star', attachment: 'clip', assignment: 'route' };

export function Timeline({ events, staff }: { events: ComplaintEvent[]; staff?: boolean }) {
  const list = [...events].reverse();
  return (
    <div className="timeline">
      {list.map((e) => (
        <div key={e.id} className={`tl-item k-${e.type}${e.visibility === 'internal' ? ' internal' : ''}`}>
          <span className="marker"><Icon name={EV_ICON[e.type] ?? 'dot'} /></span>
          <div className="row wrap gap-8">
            <span className="small" style={{ fontWeight: 600 }}>{eventTitle(e)}</span>
            {e.visibility === 'internal' && staff && <span className="tag" style={{ height: 18, fontSize: 9 }}>INTERNAL</span>}
            <span className="grow" />
            <span className="label" style={{ fontSize: 9.5 }} title={dateTime(e.createdAt)}>{ago(e.createdAt)}</span>
          </div>
          {e.actor?.name && <div className="xs muted mt-4">{e.actor.name}{e.actor.role && e.actor.role !== 'citizen' && staff ? ` · ${e.actor.role}` : ''}</div>}
          {e.message && (e.type === 'comment' || e.type === 'feedback' || e.message.length > 60 || e.type === 'escalation' || e.type === 'correction' || e.type === 'ai')
            ? <div className="bubble">{e.message}</div>
            : e.message ? <div className="small ink2 mt-4">{e.message}</div> : null}
        </div>
      ))}
    </div>
  );
}

function eventTitle(e: ComplaintEvent) {
  switch (e.type) {
    case 'status': return e.to ? STATUS_LABEL[e.to] : 'Status update';
    case 'comment': return e.actor?.role === 'citizen' ? 'Message from citizen' : 'Message from officials';
    case 'ai': return 'AI analysis';
    case 'correction': return 'Human verification';
    case 'escalation': return `Escalated${e.meta?.level ? ` · Level ${e.meta.level}` : ''}`;
    case 'feedback': return 'Citizen feedback';
    case 'attachment': return 'Evidence added';
    case 'assignment': return 'Routing change';
    default: return 'Update';
  }
}

/* ── Pipeline trace (live + recorded) ─────────────────────────── */

export const STAGES: { key: string; label: string; fr: string }[] = [
  { key: 'language', label: 'Language detection', fr: 'FR5' },
  { key: 'translation', label: 'Translation to English', fr: 'FR6' },
  { key: 'preprocess', label: 'Text preprocessing', fr: 'FR7' },
  { key: 'classification', label: 'Domain & category', fr: 'FR8·9' },
  { key: 'confidence', label: 'Context & confidence', fr: 'FR10' },
  { key: 'severity', label: 'Severity', fr: 'FR11' },
  { key: 'location', label: 'Location', fr: 'FR13' },
  { key: 'similarity', label: 'Duplicates & history', fr: 'FR16·17' },
  { key: 'priority', label: 'Priority', fr: 'FR12' },
  { key: 'routing', label: 'Department', fr: 'FR14' },
  { key: 'recommendation', label: 'Recommendation', fr: 'FR18' },
];

export function PipelineTrace({ trace, live, analyzing, showSummary = true }: { trace?: TraceStage[]; live?: StageEvent[]; analyzing?: boolean; showSummary?: boolean }) {
  const recorded = new Map((trace ?? []).map((t) => [t.key, t]));
  const liveMap = new Map((live ?? []).map((s) => [s.stage, s]));
  return (
    <div className="trace">
      {STAGES.map((s, i) => {
        const l = liveMap.get(s.key);
        const r = analyzing ? undefined : recorded.get(s.key);
        const state = l?.state ?? r?.status ?? (analyzing ? 'pending' : 'pending');
        const engine = l?.engine ?? r?.engine;
        const ms = l?.ms ?? r?.ms;
        const summary = l?.summary ?? r?.summary;
        return (
          <div key={s.key} className={`trace-row ${state}`} style={{ animationDelay: `${i * 35}ms` }}>
            <span className="idx">{String(i + 1).padStart(2, '0')}</span>
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <div className="row gap-8">
                <span className="state">
                  {state === 'running' ? <span className="spinner" style={{ width: 12, height: 12 }} /> : state === 'pending' ? <Icon name="dot" size={12} style={{ opacity: 0.4 }} /> : state === 'failed' ? <Icon name="x" size={13} /> : <Icon name="check" size={14} />}
                </span>
                <span className="small name" style={{ fontWeight: 550 }}>{s.label}</span>
                <span className="label" style={{ fontSize: 9 }}>{s.fr}</span>
              </div>
              {showSummary && summary && <span className="xs muted" style={{ paddingLeft: 26 }}>{summary}</span>}
              {state === 'running' && <div className="meter" style={{ marginLeft: 26 }} />}
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              {engine && <span className="tag" style={{ height: 18, fontSize: 9, color: engine === 'openai' ? 'var(--lichen)' : undefined }}>{engine === 'openai' ? 'GPT' : engine === 'local' ? 'LOCAL' : 'RULES'}</span>}
              {ms != null && <span className="num dim" style={{ fontSize: 10 }}>{ms}ms</span>}
              {state === 'fallback' && <span className="xs" style={{ color: 'var(--ochre)' }}>fallback</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Attachments ──────────────────────────────────────────────── */

export function Attachments({ c }: { c: ComplaintDetail }) {
  if (!c.attachments.length) return <p className="small muted">No supporting files.</p>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
      {c.attachments.map((a) => {
        const url = `/api/complaints/${c.id}/attachments/${a.id}`;
        const isImg = a.mime.startsWith('image/');
        return (
          <a key={a.id} href={url} target="_blank" rel="noreferrer" className="sheet" style={{ overflow: 'hidden', display: 'block' }}>
            <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-sunken)', display: 'grid', placeItems: 'center' }} className={isImg ? '' : 'hatch-soft'}>
              {isImg ? <img src={url} alt={a.filename} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="tag">{a.mime.split('/')[1]?.toUpperCase().slice(0, 4)}</span>}
            </div>
            <div style={{ padding: '8px 10px' }}>
              <div className="xs ellipsis" style={{ fontWeight: 550 }}>{a.filename}</div>
              <div className="label" style={{ fontSize: 9 }}>{bytes(a.size)}</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

/* ── File picker with previews (FR4) ──────────────────────────── */

export function FilePicker({ files, onChange, max = 5 }: { files: File[]; onChange: (f: File[]) => void; max?: number }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const accept = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf|video\/mp4|audio\/(mpeg|mp4|wav|ogg|webm))$/;
  const add = (list: FileList | null) => {
    if (!list) return;
    setErr('');
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!accept.test(f.type)) { setErr(`“${f.name}” isn't a supported type (images, PDF, MP4, audio).`); continue; }
      if (f.size > 10 * 1024 * 1024) { setErr(`“${f.name}” is larger than 10 MB.`); continue; }
      if (next.length >= max) { setErr(`You can attach up to ${max} files.`); break; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
  };
  return (
    <div className="col gap-8">
      <div
        className={`dropzone${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" multiple hidden accept="image/*,application/pdf,video/mp4,audio/*" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <div className="col center gap-6">
          <Icon name="upload" size={22} style={{ color: 'var(--ink-3)' }} />
          <span className="small" style={{ fontWeight: 600 }}>Drop photos, documents or voice notes</span>
          <span className="xs muted">or click to browse · up to {max} files · 10 MB each</span>
        </div>
      </div>
      {err && <span className="field-error">{err}</span>}
      {files.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
          {files.map((f, i) => (
            <div key={`${f.name}${i}`} className="file-chip rise">
              {f.type.startsWith('image/') ? <img className="thumb" src={URL.createObjectURL(f)} alt="" /> : <span className="thumb">{f.type.split('/')[1]?.slice(0, 4).toUpperCase()}</span>}
              <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                <span className="ellipsis">{f.name}</span>
                <span className="label" style={{ fontSize: 9 }}>{bytes(f.size)}</span>
              </span>
              <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Conversation box ─────────────────────────────────────────── */

export function CommentBox({ c, staff }: { c: ComplaintDetail; staff?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [msg, setMsg] = useState('');
  const [internal, setInternal] = useState(false);
  const m = useMutation({
    mutationFn: () => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/comments`, { message: msg, visibility: internal ? 'internal' : 'public' }),
    onSuccess: (r) => {
      qc.setQueryData(['complaint', c.id], r.complaint);
      setMsg('');
      toast.push({ title: internal ? 'Internal note added' : 'Message sent', tone: 'success' });
    },
    onError: (e) => toast.error(e),
  });
  if (!c.permissions.canComment) return null;
  return (
    <form className="col gap-8" onSubmit={(e) => { e.preventDefault(); if (msg.trim().length >= 2) m.mutate(); }}>
      <Field label={staff ? (internal ? 'Internal note (staff only)' : 'Message to citizen') : 'Add information or ask a question'} counter={<span className={`counter${msg.length > 1800 ? ' warn' : ''}`}>{msg.length}/2000</span>}>
        <textarea className="textarea" style={{ minHeight: 84 }} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={staff ? 'Write an update…' : 'Anything the officials should know?'} />
      </Field>
      <div className="row between">
        {staff ? (
          <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note — not visible to the citizen</label>
        ) : <span className="xs muted">Officials will be notified.</span>}
        <Button type="submit" variant={internal ? 'default' : 'primary'} size="sm" icon="message" loading={m.isPending} disabled={msg.trim().length < 2}>{internal ? 'Save note' : 'Send'}</Button>
      </div>
    </form>
  );
}

/* ── SLA indicator ────────────────────────────────────────────── */

export function Sla({ due, status }: { due: string | null; status: Status }) {
  if (!due || !['assigned', 'in_progress', 'on_hold', 'reopened'].includes(status)) return null;
  const d = dueIn(due);
  return (
    <span className="chip" style={{ ['--c' as string]: d.overdue ? 'var(--oxide)' : 'var(--ink-3)' }}>
      <Icon name="clock" size={12} /> {d.text}
    </span>
  );
}
