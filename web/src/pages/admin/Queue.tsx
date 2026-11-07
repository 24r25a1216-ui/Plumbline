import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { ago, LANG_LABEL, pct } from '../../lib/format';
import type { ComplaintSummary, Paged } from '../../lib/types';
import { DomainTag, EmptyState, ErrorState, PageHead, PriorityStamp, Segmented, Severity, SkeletonRows } from '../../components/ui';
import { Ring } from '../../components/Charts';
import { Icon } from '../../components/Icon';

type Sort = 'priority' | 'oldest' | 'newest';

export default function Queue() {
  const [sort, setSort] = useState<Sort>('priority');
  const [domain, setDomain] = useState<string>('');
  const q = useQuery({
    queryKey: ['complaints', 'queue', sort, domain],
    queryFn: () => api.get<Paged<ComplaintSummary>>(`/complaints${qs({ status: 'awaiting_verification,analyzing,submitted', sort, domain, pageSize: 100 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const items = q.data?.items ?? [];
  const lowConf = items.filter((c) => (c.confidence ?? 1) < 0.5).length;
  const dups = items.filter((c) => (c.duplicateScore ?? 0) > 0).length;

  return (
    <div className="col gap-20">
      <PageHead
        index="CELL · 01"
        eyebrow="FR19 · FR20 · Human verification"
        title={<>Verification <em className="serif-i accent">queue</em></>}
        sub="Every complaint stops here before it reaches a department. Review the AI's reasoning, correct anything that's off, then assign."
      />

      <div className="grid g-4">
        {[
          ['In queue', items.filter((c) => c.status === 'awaiting_verification').length, 'var(--ink-1)'],
          ['Analysing', items.filter((c) => c.status !== 'awaiting_verification').length, 'var(--lichen)'],
          ['Low confidence', lowConf, 'var(--ochre)'],
          ['Possible duplicates', dups, 'var(--clay)'],
        ].map(([l, v, c]) => (
          <div key={l as string} className="sheet" style={{ padding: '14px 16px' }}>
            <span className="label">{l}</span>
            <div className="num mt-4" style={{ fontSize: 28, color: c as string, letterSpacing: '-0.04em' }}>{q.isLoading ? '–' : (v as number)}</div>
          </div>
        ))}
      </div>

      <div className="row between wrap gap-12">
        <Segmented<Sort> value={sort} onChange={setSort} options={[{ value: 'priority', label: 'Most urgent' }, { value: 'oldest', label: 'Oldest first' }, { value: 'newest', label: 'Newest' }]} />
        <Segmented value={domain} onChange={setDomain} options={[{ value: '', label: 'All domains' }, { value: 'education', label: 'Education' }, { value: 'healthcare', label: 'Healthcare' }, { value: 'public_service', label: 'Public service' }]} />
      </div>

      <section className="sheet">
        {q.isLoading ? <SkeletonRows n={6} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !items.length ? (
          <EmptyState title="Queue is clear" body="Every analysed complaint has been verified and assigned. New ones will appear here the moment their analysis completes." />
        ) : (
          <div className="stagger">
            {items.map((c) => (
              <Link key={c.id} to={`/admin/c/${c.id}`} className="list-item" style={{ alignItems: 'center', padding: '16px 18px' }}>
                <PriorityStamp p={c.priority} />
                <div className="col gap-6 grow" style={{ minWidth: 0 }}>
                  <div className="row wrap gap-8">
                    <span className="mono xs muted">{c.ref}</span>
                    {c.analyzing && <span className="chip live" style={{ ['--c' as string]: 'var(--lichen)' }}><span className="dot" />Analysing</span>}
                    {c.escalationLevel > 1 && <span className="chip" style={{ ['--c' as string]: 'var(--oxide)' }}><Icon name="alert" size={11} />L{c.escalationLevel}</span>}
                    {(c.duplicateScore ?? 0) > 0 && <span className="chip" style={{ ['--c' as string]: 'var(--clay)' }}><Icon name="merge" size={11} />Possible duplicate · {pct(c.duplicateScore)}</span>}
                    {c.language && c.language !== 'en' && <span className="tag">{LANG_LABEL[c.language]}</span>}
                  </div>
                  <span className={`small ellipsis${c.language && c.language !== 'en' ? ` lang-${c.language}` : ''}`} style={{ fontWeight: 600, fontSize: 14.5 }}>{c.title}</span>
                  <div className="row wrap gap-16 xs muted">
                    {c.domain ? <DomainTag domain={c.domain} label={c.categoryLabel} /> : <span>Awaiting classification</span>}
                    {c.district && <span className="row gap-6"><Icon name="pin" size={12} />{c.district}</span>}
                    <span className="row gap-6"><Icon name="clock" size={12} />{ago(c.createdAt)}</span>
                  </div>
                </div>
                <div className="row gap-16 hide-sm">
                  <Severity level={c.severity} />
                  <div className="row gap-8" title="AI confidence">
                    <Ring value={c.confidence ?? 0} size={34} stroke={3} color={(c.confidence ?? 0) >= 0.75 ? 'var(--verdigris)' : (c.confidence ?? 0) >= 0.5 ? 'var(--ochre)' : 'var(--oxide)'} />
                    <span className="num xs">{pct(c.confidence)}</span>
                  </div>
                </div>
                <Icon name="chevronRight" size={16} style={{ color: 'var(--ink-3)' }} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
