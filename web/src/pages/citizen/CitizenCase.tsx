import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { ago, dateShort, dateTime, LANG_LABEL } from '../../lib/format';
import type { CitizenAnalysis, ComplaintDetail } from '../../lib/types';
import { useLive } from '../../lib/live';
import { Button, DomainTag, ErrorState, Field, PriorityStamp, Severity, SheetHead, Skeleton, StatusChip } from '../../components/ui';
import { Attachments, CommentBox, FilePicker, JourneyRail, PipelineTrace, Sla, Timeline } from '../../components/Case';
import { ConfirmDialog } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

export default function CitizenCase() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { stages } = useLive();
  const q = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => api.get<{ complaint: ComplaintDetail }>(`/complaints/${id}`).then((r) => r.complaint),
    refetchInterval: (query) => (query.state.data?.analyzing ? 2500 : false),
  });

  if (q.isLoading) return <CaseSkeleton />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const c = q.data!;
  const ai = c.ai as CitizenAnalysis | null;
  const live = stages[c.id];
  const showTrace = c.analyzing || !!live || params.get('fresh') === '1';
  const translated = c.bodyEnglish && c.translationMethod && c.translationMethod !== 'none';

  return (
    <div className="col gap-20">
      <Link to="/app" className="row gap-6 small muted" style={{ alignSelf: 'flex-start' }}><Icon name="arrowLeft" size={14} /> All complaints</Link>

      <section className="sheet case-hero reg rise">
        <div className="row wrap gap-10">
          <span className="ref">{c.ref}</span>
          <StatusChip status={c.status} live={c.analyzing} />
          {c.escalationLevel > 0 && <span className="chip" style={{ ['--c' as string]: 'var(--oxide)' }}><Icon name="alert" size={11} /> Escalated · L{c.escalationLevel}</span>}
          <Sla due={c.slaDueAt} status={c.status} />
          <span className="grow" />
          <span className="xs muted">Filed {dateTime(c.createdAt)}</span>
        </div>
        <h1 className={`case-title mt-12${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`}>{c.title}</h1>
        <div className="row wrap gap-16 small muted mt-12">
          {c.verifiedAt && c.domain && <DomainTag domain={c.domain} label={`${c.domainLabel} · ${c.categoryLabel}`} />}
          {c.locationText && <span className="row gap-6"><Icon name="pin" size={13} />{c.locationText}{c.district ? `, ${c.district}` : ''}</span>}
          {c.language && <span className="row gap-6"><Icon name="translate" size={13} />Written in {LANG_LABEL[c.language]}</span>}
        </div>
        <div className="mt-24">
          <JourneyRail status={c.status} />
        </div>
      </section>

      {c.status === 'merged' && c.duplicateOf && (
        <div className="callout info"><Icon name="merge" /><span>This issue was already reported as <b className="mono">{c.duplicateOf.ref}</b> and is being handled there — merging keeps one team accountable instead of splitting effort.</span></div>
      )}
      {c.status === 'rejected' && <div className="callout warn"><Icon name="alert" /><span>{c.events.filter((e) => e.to === 'rejected').at(-1)?.message ?? 'This complaint could not be accepted.'}</span></div>}

      <div className="grid g-main-side" style={{ gap: 20 }}>
        <div className="col gap-20" style={{ minWidth: 0 }}>
          {showTrace && (
            <section className="sheet rise">
              <SheetHead fig="LIVE" title={c.analyzing ? 'Analysing your complaint…' : 'Analysis complete'} icon="spark" right={c.analyzing ? <span className="spinner" /> : <span className="chip" style={{ ['--c' as string]: 'var(--verdigris)' }}><Icon name="check" size={11} /> Done</span>} />
              <div className="sheet-body">
                <PipelineTrace trace={ai?.trace} live={live} analyzing={c.analyzing} showSummary={false} />
                {!c.analyzing && <p className="small muted mt-12">An official is now reviewing this analysis before assigning your complaint. You'll be notified.</p>}
              </div>
            </section>
          )}

          <section className="sheet">
            <SheetHead fig="A" title="Your complaint" />
            <div className="sheet-body col gap-16">
              <div className={`quote-block${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`} lang={c.language ?? undefined}>{c.body}</div>
              {translated && (
                <div className="col gap-8">
                  <span className="label row gap-6"><Icon name="translate" size={12} /> English translation · {c.translationMethod === 'openai' ? 'neural' : 'approximate'}</span>
                  <div className="quote-block en serif-i" style={{ fontSize: 16 }}>{c.bodyEnglish}</div>
                </div>
              )}
              {(c.incidentDate || c.pincode) && (
                <div className="row gap-16 small muted">
                  {c.incidentDate && <span>Started {dateShort(c.incidentDate)}</span>}
                  {c.pincode && <span className="mono">PIN {c.pincode}</span>}
                </div>
              )}
            </div>
          </section>

          <section className="sheet">
            <SheetHead fig="B" title="Evidence" right={<span className="label">{c.attachments.length} file{c.attachments.length === 1 ? '' : 's'}</span>} />
            <div className="sheet-body col gap-16">
              <Attachments c={c} />
              {c.permissions.canAttach && <AddEvidence c={c} />}
            </div>
          </section>

          <section className="sheet">
            <SheetHead fig="C" title="Timeline" right={<span className="label">{c.events.length} events</span>} />
            <div className="sheet-body col gap-24">
              <CommentBox c={c} />
              <Timeline events={c.events} />
            </div>
          </section>
        </div>

        <aside className="col gap-16">
          {c.permissions.canFeedback && <FeedbackPanel c={c} />}

          {c.resolutionNote && (
            <section className="sheet accent-edge">
              <SheetHead title="How it was resolved" icon="check" />
              <div className="sheet-body col gap-8">
                <p className="small ink2" style={{ lineHeight: 1.65 }}>{c.resolutionNote}</p>
                <span className="xs muted">Resolved {ago(c.resolvedAt)}</span>
              </div>
            </section>
          )}

          {c.feedback && (
            <section className="sheet">
              <SheetHead title="Your rating" icon="star" />
              <div className="sheet-body col gap-8">
                <span className="num" style={{ fontSize: 28 }}>{c.feedback.rating}<span className="muted small">/5</span></span>
                {c.feedback.comment && <p className="small ink2">“{c.feedback.comment}”</p>}
              </div>
            </section>
          )}

          <section className="sheet">
            <SheetHead title="Handling" icon="building" />
            <div className="sheet-body">
              {c.department ? (
                <dl className="kv">
                  <dt>Department</dt><dd>{c.department.name}</dd>
                  {c.assignedOfficer && <>
                    <dt>Assigned officer</dt><dd>{c.assignedOfficer.name}</dd>
                    <dt>Officer email</dt><dd><a href={`mailto:${c.assignedOfficer.email}`}>{c.assignedOfficer.email}</a></dd>
                    <dt>Officer phone</dt><dd>{c.assignedOfficer.phone ? <a href={`tel:${c.assignedOfficer.phone}`}>{c.assignedOfficer.phone}</a> : 'Not available'}</dd>
                  </>}
                  <dt>Category</dt><dd>{c.categoryLabel}</dd>
                  <dt>Severity</dt><dd><Severity level={c.severity} /></dd>
                  <dt>Priority</dt><dd><PriorityStamp p={c.priority} /></dd>
                  {c.slaDueAt && <><dt>Target date</dt><dd>{dateShort(c.slaDueAt)}</dd></>}
                  {ai?.recommendation && <><dt>Typical time</dt><dd>~{ai.recommendation.expectedDays} days for similar cases</dd></>}
                </dl>
              ) : (
                <p className="small muted" style={{ lineHeight: 1.6 }}>
                  {c.analyzing ? 'Working out which department owns this…' : ['withdrawn', 'rejected', 'merged'].includes(c.status) ? 'Not assigned.' : 'An official is verifying the analysis. The department will appear here once assigned.'}
                </p>
              )}
              {ai?.recommendation?.citizenMessage && c.department && (
                <div className="callout mt-16"><Icon name="message" /><span>{ai.recommendation.citizenMessage}</span></div>
              )}
            </div>
          </section>

          {c.permissions.canWithdraw && <WithdrawPanel c={c} />}
        </aside>
      </div>
    </div>
  );
}

function AddEvidence({ c }: { c: ComplaintDetail }) {
  const [files, setFiles] = useState<File[]>([]);
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      return api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/attachments`, fd);
    },
    onSuccess: (r) => { qc.setQueryData(['complaint', c.id], r.complaint); setFiles([]); toast.push({ title: 'Evidence added', tone: 'success' }); },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="col gap-8">
      <FilePicker files={files} onChange={setFiles} max={Math.max(1, 10 - c.attachments.length)} />
      {files.length > 0 && <Button variant="primary" size="sm" icon="upload" loading={m.isPending} onClick={() => m.mutate()} style={{ alignSelf: 'flex-start' }}>Upload {files.length} file{files.length > 1 ? 's' : ''}</Button>}
    </div>
  );
}

function WithdrawPanel({ c }: { c: ComplaintDetail }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (reason: string) => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/withdraw`, { reason }),
    onSuccess: (r) => { qc.setQueryData(['complaint', c.id], r.complaint); qc.invalidateQueries({ queryKey: ['complaints'] }); setOpen(false); toast.push({ title: 'Complaint withdrawn', tone: 'info' }); },
    onError: (e) => toast.error(e),
  });
  return (
    <section className="sheet sunken" style={{ padding: 16 }}>
      <span className="label">Changed your mind?</span>
      <p className="xs muted mt-8">You can withdraw until the complaint is assigned to a department.</p>
      <Button variant="danger" size="sm" className="mt-12" onClick={() => setOpen(true)}>Withdraw complaint</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={(reason) => m.mutate(reason)}
        busy={m.isPending}
        danger
        title={`Withdraw ${c.ref}?`}
        body="The complaint will be closed and no department will act on it. This cannot be undone — you would need to file again."
        reason
        reasonLabel="Reason (optional)"
        reasonPlaceholder="e.g. The issue was fixed on its own."
        confirmLabel="Withdraw"
      />
    </section>
  );
}

function FeedbackPanel({ c }: { c: ComplaintDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [reopen, setReopen] = useState(false);
  const [err, setErr] = useState('');
  const m = useMutation({
    mutationFn: () => api.post<{ complaint: ComplaintDetail }>(`/complaints/${c.id}/feedback`, { rating, satisfied: !!satisfied, comment, reopen: satisfied === false && reopen }),
    onSuccess: (r) => {
      qc.setQueryData(['complaint', c.id], r.complaint);
      qc.invalidateQueries({ queryKey: ['complaints'] });
      toast.push({ title: reopen && satisfied === false ? 'Complaint reopened and escalated' : 'Thank you for your feedback', tone: 'success' });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not submit'),
  });
  const labels = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];
  return (
    <section className="sheet reg" style={{ borderColor: 'var(--lichen-line)' }}>
      <SheetHead fig="FR24" title="Was this resolved?" icon="star" />
      <div className="sheet-body col gap-16">
        <p className="small ink2">Your rating closes the case — or sends it back with an escalation if the fix wasn't real.</p>
        <div className="col gap-8">
          <div className="stars" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>{n}</button>
            ))}
          </div>
          <span className="xs muted">{rating ? labels[rating] : 'Tap a number'}</span>
        </div>
        <div className="row gap-8">
          <button type="button" className={`btn btn-sm ${satisfied === true ? 'btn-primary' : ''}`} onClick={() => setSatisfied(true)}><Icon name="check" /> Yes, fixed</button>
          <button type="button" className={`btn btn-sm ${satisfied === false ? 'btn-danger' : ''}`} onClick={() => setSatisfied(false)}><Icon name="x" /> Not really</button>
        </div>
        {satisfied === false && c.permissions.canReopen && (
          <label className="check"><input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} /> Reopen the complaint and escalate it{c.reopenDeadline ? ` (until ${dateShort(c.reopenDeadline)})` : ''}</label>
        )}
        <Field label="Comment" optional>
          <textarea className="textarea" style={{ minHeight: 72 }} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="What went well, or what's still wrong?" />
        </Field>
        {err && <span className="field-error">{err}</span>}
        <Button variant="primary" disabled={!rating || satisfied === null} loading={m.isPending} onClick={() => m.mutate()}>
          {satisfied === false && reopen ? 'Reopen & escalate' : 'Submit feedback'}
        </Button>
      </div>
    </section>
  );
}

function CaseSkeleton() {
  return (
    <div className="col gap-20">
      <div className="sheet" style={{ padding: 26 }}>
        <Skeleton h={12} w={180} />
        <div className="mt-16"><Skeleton h={30} w="55%" /></div>
        <div className="mt-24"><Skeleton h={50} /></div>
      </div>
      <div className="grid g-main-side"><div className="sheet" style={{ height: 300 }} /><div className="sheet" style={{ height: 220 }} /></div>
    </div>
  );
}
