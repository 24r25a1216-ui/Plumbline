import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { useSession } from '../../lib/session';
import { caseBase } from '../../lib/live';
import { ago, dueIn, STATUS_LABEL } from '../../lib/format';
import type { ComplaintSummary, Paged, Status, Taxonomy } from '../../lib/types';
import { Button, DomainTag, EmptyState, ErrorState, PageHead, PriorityStamp, Severity, SkeletonRows, StatusChip } from '../../components/ui';
import { Icon } from '../../components/Icon';

const STATUS_OPTIONS: (Status | 'open')[] = ['open', 'awaiting_verification', 'assigned', 'in_progress', 'on_hold', 'reopened', 'resolved', 'closed', 'rejected', 'merged', 'withdrawn'];

export default function Registry({ preset }: { preset?: 'escalations' }) {
  const { user } = useSession();
  const admin = user!.role === 'admin';
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.get<Taxonomy>('/meta/taxonomy'), staleTime: Infinity });
  const [search, setSearch] = useState(sp.get('q') ?? '');

  const f = {
    q: sp.get('q') ?? '',
    status: sp.get('status') ?? (preset === 'escalations' ? 'open' : ''),
    domain: sp.get('domain') ?? '',
    priority: sp.get('priority') ?? '',
    department: sp.get('department') ?? '',
    district: sp.get('district') ?? '',
    escalated: preset === 'escalations' ? '1' : sp.get('escalated') ?? '',
    overdue: sp.get('overdue') ?? '',
    sort: sp.get('sort') ?? (preset === 'escalations' ? 'sla' : 'newest'),
    page: Number(sp.get('page') ?? 1),
  };
  const setF = (patch: Partial<Record<keyof typeof f, string | number>>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  };

  useEffect(() => {
    const t = window.setTimeout(() => search !== f.q && setF({ q: search }), 300);
    return () => window.clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = { ...f, pageSize: 25 };
  const q = useQuery({
    queryKey: ['complaints', 'registry', params],
    queryFn: () => api.get<Paged<ComplaintSummary>>(`/complaints${qs(params)}`),
    placeholderData: keepPreviousData,
  });
  const activeFilters = [f.status && !preset, f.domain, f.priority, f.department, f.district, f.escalated && !preset, f.overdue, f.q].filter(Boolean).length;
  const exportUrl = `/api/complaints/export.csv${qs({ ...f, page: undefined })}`;

  return (
    <div className="col gap-20">
      <PageHead
        index={preset ? 'FR23' : 'REG · 02'}
        eyebrow={preset ? 'Automatic & manual escalations' : admin ? 'All complaints · statewide' : `${user!.department?.name}`}
        title={preset ? <>Escalations <em className="serif-i" style={{ color: 'var(--oxide)' }}>in flight</em></> : <>Case <em className="serif-i accent">registry</em></>}
        sub={preset ? 'Cases that breached their deadline, stalled in verification, were reopened by citizens, or were flagged urgent on arrival — most overdue first.' : undefined}
        actions={<a className="btn" href={exportUrl} download><Icon name="download" /> Export {q.data ? q.data.total : ''} as CSV</a>}
      />

      <section className="sheet">
        <div className="row wrap gap-8" style={{ padding: 14, borderBottom: '1px solid var(--line-1)' }}>
          <div className="input-wrap" style={{ flex: '1 1 260px' }}>
            <Icon name="search" />
            <input className="input input-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, title, text, place…" aria-label="Search complaints" />
          </div>
          {!preset && (
            <select className="select input-sm" style={{ width: 'auto' }} value={f.status} onChange={(e) => setF({ status: e.target.value })} aria-label="Status">
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'open' ? 'All open' : STATUS_LABEL[s]}</option>)}
            </select>
          )}
          <select className="select input-sm" style={{ width: 'auto' }} value={f.domain} onChange={(e) => setF({ domain: e.target.value })} aria-label="Domain">
            <option value="">Any domain</option>
            {tax.data?.domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <select className="select input-sm" style={{ width: 'auto' }} value={f.priority} onChange={(e) => setF({ priority: e.target.value })} aria-label="Priority">
            <option value="">Any priority</option>
            {['P1', 'P2', 'P3', 'P4'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {admin && (
            <select className="select input-sm" style={{ width: 'auto' }} value={f.department} onChange={(e) => setF({ department: e.target.value })} aria-label="Department">
              <option value="">Any department</option>
              {tax.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          )}
          <select className="select input-sm" style={{ width: 'auto' }} value={f.district} onChange={(e) => setF({ district: e.target.value })} aria-label="District">
            <option value="">Any district</option>
            {tax.data?.districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          {!preset && (
            <button className={`btn btn-sm ${f.escalated ? 'btn-danger' : ''}`} onClick={() => setF({ escalated: f.escalated ? '' : '1' })}><Icon name="alert" /> Escalated</button>
          )}
          <button className={`btn btn-sm ${f.overdue ? 'btn-danger' : ''}`} onClick={() => setF({ overdue: f.overdue ? '' : '1' })}><Icon name="clock" /> Overdue</button>
          <span className="grow" />
          <select className="select input-sm" style={{ width: 'auto' }} value={f.sort} onChange={(e) => setF({ sort: e.target.value })} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="updated">Recently updated</option>
            <option value="priority">Priority</option>
            <option value="severity">Severity</option>
            <option value="sla">Deadline</option>
          </select>
          {activeFilters > 0 && <Button size="sm" variant="ghost" icon="x" onClick={() => { setSearch(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear {activeFilters}</Button>}
        </div>

        {q.isLoading ? <SkeletonRows n={8} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.items.length ? (
          activeFilters ? (
            <EmptyState title="No cases match" body="Try removing a filter or broadening your search." action={<Button onClick={() => { setSearch(''); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Button>} />
          ) : (
            <EmptyState title={preset ? 'No active escalations' : 'No cases yet'} body={preset ? 'Everything is within its deadline. Escalations appear here automatically.' : 'Complaints routed to you will appear here.'} />
          )
        ) : (
          <div className="table-wrap" style={{ opacity: q.isPlaceholderData ? 0.6 : 1, transition: 'opacity .2s' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ref</th><th>Complaint</th><th>Status</th><th>Pri</th><th className="hide-sm">Severity</th>{admin && <th className="hide-sm">Dept</th>}<th className="hide-sm">District</th><th>{preset ? 'Deadline' : 'Updated'}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((c) => {
                  const due = dueIn(c.slaDueAt);
                  return (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`${caseBase(user!.role)}${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`${caseBase(user!.role)}${c.id}`)}>
                      <td className="ref">{c.ref}</td>
                      <td style={{ maxWidth: 380 }}>
                        <div className={`ellipsis${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`} style={{ fontWeight: 550 }}>{c.title}</div>
                        <div className="row gap-8 mt-4">
                          {c.domain && <DomainTag domain={c.domain} label={c.categoryLabel} />}
                          {c.escalationLevel > 1 && <span className="chip" style={{ ['--c' as string]: 'var(--oxide)', height: 18 }}>L{c.escalationLevel}</span>}
                        </div>
                      </td>
                      <td><StatusChip status={c.status} live={c.analyzing} /></td>
                      <td><PriorityStamp p={c.priority} /></td>
                      <td className="hide-sm"><Severity level={c.severity} showLabel={false} /></td>
                      {admin && <td className="hide-sm mono xs">{c.department?.code ?? <span className="dim">—</span>}</td>}
                      <td className="hide-sm xs muted">{c.district ?? '—'}</td>
                      <td className="xs nowrap" style={{ color: preset && due.overdue ? 'var(--oxide)' : 'var(--ink-3)' }}>{preset && c.slaDueAt ? due.text : ago(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {q.data && q.data.total > 0 && (
          <div className="pager">
            <span className="xs muted">{(q.data.page - 1) * q.data.pageSize + 1}–{Math.min(q.data.total, q.data.page * q.data.pageSize)} of {q.data.total}</span>
            <div className="row gap-8">
              <Button size="sm" icon="chevronLeft" disabled={q.data.page <= 1} onClick={() => setF({ page: q.data!.page - 1 })}>Prev</Button>
              <span className="num xs muted">{q.data.page}/{q.data.pages}</span>
              <Button size="sm" iconRight="chevronRight" disabled={q.data.page >= q.data.pages} onClick={() => setF({ page: q.data!.page + 1 })}>Next</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
