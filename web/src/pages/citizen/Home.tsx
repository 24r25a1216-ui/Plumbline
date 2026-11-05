import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { useSession } from '../../lib/session';
import { ago, dueIn, LANG_LABEL } from '../../lib/format';
import type { ComplaintSummary, Paged } from '../../lib/types';
import { Button, DomainTag, EmptyState, ErrorState, PriorityStamp, Segmented, Severity, StatusChip, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';

type Filter = 'all' | 'open' | 'resolved' | 'closed';
const FILTER_STATUS: Record<Filter, string | undefined> = { all: undefined, open: 'open', resolved: 'resolved', closed: 'closed,withdrawn,rejected,merged' };

export default function CitizenHome() {
  const { user } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['complaints', 'mine', filter, page],
    queryFn: () => api.get<Paged<ComplaintSummary>>(`/complaints${qs({ status: FILTER_STATUS[filter], page, pageSize: 8, sort: 'updated' })}`),
    placeholderData: keepPreviousData,
  });
  const sc = list.data?.statusCounts ?? {};
  const openN = ['submitted', 'analyzing', 'awaiting_verification', 'assigned', 'in_progress', 'on_hold', 'reopened'].reduce((a, k) => a + (sc[k] ?? 0), 0);
  const total = Object.values(sc).reduce((a, b) => a + b, 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = user!.name.split(' ')[0];

  return (
    <div className="col gap-24">
      <section className="sheet welcome reg rise">
        <div className="row between wrap gap-24" style={{ position: 'relative' }}>
          <div className="col gap-12" style={{ maxWidth: 620 }}>
            <span className="label">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1 className="display" style={{ fontSize: 'clamp(24px, 2.4vw, 30px)' }}>{greet}, <em>{first}.</em></h1>
            <p className="lead">
              {openN ? <>You have <b className="accent">{openN}</b> unresolved {openN === 1 ? 'complaint' : 'complaints'}. Every change appears here the moment it happens.</> : total ? 'No unresolved complaints right now. If something else needs attention, we are listening.' : 'Tell us what went wrong — in English, हिन्दी or తెలుగు. We will take it from there.'}
            </p>
          </div>
          <div className="row gap-24 wrap">
            {[
              ['Filed', total, 'var(--ink-2)'],
              ['Unresolved', openN, 'var(--lichen)'],
              ['Resolved', (sc.resolved ?? 0) + (sc.closed ?? 0), 'var(--verdigris)'],
              ['To rate', sc.resolved ?? 0, 'var(--ochre)'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="col gap-4">
                <span className="num" style={{ fontSize: 34, color: c as string, letterSpacing: '-0.04em', lineHeight: 1 }}>{list.isLoading ? '–' : (v as number)}</span>
                <span className="label">{l}</span>
              </div>
            ))}
            <Link to="/app/new" className="btn btn-primary btn-lg"><Icon name="plus" /> File a complaint</Link>
          </div>
        </div>
      </section>

      {(sc.resolved ?? 0) > 0 && filter === 'all' && (
        <div className="callout warn rise">
          <Icon name="star" />
          <span><b style={{ color: 'var(--ink-1)' }}>{sc.resolved} resolution{sc.resolved > 1 ? 's' : ''} awaiting your rating.</b> Your feedback decides whether the case closes — or gets reopened and escalated.</span>
          <span className="grow" />
          <button className="btn btn-sm" onClick={() => setFilter('resolved')}>Review</button>
        </div>
      )}

      <div className="row between wrap gap-12">
        <h2 className="h2">Your complaints</h2>
        <Segmented<Filter>
          value={filter}
          onChange={(v) => { setFilter(v); setPage(1); }}
          options={[
            { value: 'all', label: 'All', count: total },
            { value: 'open', label: 'Unresolved', count: openN },
            { value: 'resolved', label: 'Resolved', count: sc.resolved ?? 0 },
            { value: 'closed', label: 'Closed', count: (sc.closed ?? 0) + (sc.withdrawn ?? 0) + (sc.rejected ?? 0) + (sc.merged ?? 0) },
          ]}
        />
      </div>

      {list.isLoading ? (
        <div className="col gap-12">{[0, 1, 2].map((i) => <div key={i} className="sheet" style={{ padding: 20 }}><Skeleton h={12} w={140} /><div className="mt-12"><Skeleton h={18} w="60%" /></div><div className="mt-12"><Skeleton h={12} w="40%" /></div></div>)}</div>
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : !list.data?.items.length ? (
        <div className="sheet">
          {total === 0 ? (
            <EmptyState title="No complaints yet" body="When you file a complaint it appears here with live progress, the department handling it and every update." action={<Link to="/app/new" className="btn btn-primary"><Icon name="plus" /> File your first complaint</Link>} />
          ) : (
            <EmptyState title="Nothing in this view" body="No complaints match this filter." action={<Button onClick={() => setFilter('all')}>Show all</Button>} />
          )}
        </div>
      ) : (
        <div className="col gap-12 stagger" style={{ opacity: list.isFetching && list.isPlaceholderData ? 0.6 : 1, transition: 'opacity .2s' }}>
          {list.data.items.map((c) => <CaseCard key={c.id} c={c} />)}
        </div>
      )}

      {list.data && list.data.pages > 1 && (
        <div className="row between">
          <span className="small muted">Page {list.data.page} of {list.data.pages}</span>
          <div className="row gap-8">
            <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" iconRight="chevronRight" disabled={page >= list.data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseCard({ c }: { c: ComplaintSummary }) {
  const due = dueIn(c.slaDueAt);
  const active = ['assigned', 'in_progress', 'on_hold', 'reopened'].includes(c.status);
  return (
    <Link to={`/app/c/${c.id}`} className="case-card" style={{ ['--c' as string]: c.severity ? `var(--sev-${c.severity})` : 'var(--line-2)' }}>
      <span className={`edge${c.severity && c.severity >= 4 ? ' hatch' : ''}`} />
      <div className="col gap-8" style={{ minWidth: 0 }}>
        <div className="row wrap gap-8">
          <span className="mono xs muted">{c.ref}</span>
          <StatusChip status={c.status} live={c.analyzing} />
          {c.escalationLevel > 0 && <span className="chip" style={{ ['--c' as string]: 'var(--oxide)' }}><Icon name="alert" size={11} /> Escalated L{c.escalationLevel}</span>}
          {c.status === 'resolved' && <span className="chip" style={{ ['--c' as string]: 'var(--ochre)' }}><Icon name="star" size={11} /> Awaiting your rating</span>}
        </div>
        <h3 className={`h3 ellipsis${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`} style={{ fontSize: 16 }}>{c.title}</h3>
        <div className="row wrap gap-16 small muted">
          {c.domain && <DomainTag domain={c.domain} label={c.categoryLabel} />}
          {c.department && <span className="row gap-6"><Icon name="building" size={13} />{c.department.name}</span>}
          {c.locationText && <span className="row gap-6"><Icon name="pin" size={13} />{c.locationText}</span>}
          {c.language && c.language !== 'en' && <span className="row gap-6"><Icon name="translate" size={13} />{LANG_LABEL[c.language]}</span>}
          {c.attachmentCount > 0 && <span className="row gap-6"><Icon name="clip" size={13} />{c.attachmentCount}</span>}
        </div>
      </div>
      <div className="col gap-8" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span className="xs muted nowrap">Updated {ago(c.updatedAt)}</span>
        <div className="row gap-12">
          {c.verifiedAt && <Severity level={c.severity} showLabel={false} />}
          {c.verifiedAt && <PriorityStamp p={c.priority} />}
        </div>
        {active && c.slaDueAt && <span className="xs nowrap" style={{ color: due.overdue ? 'var(--oxide)' : 'var(--ink-3)' }}>Target · {due.text}</span>}
      </div>
    </Link>
  );
}
