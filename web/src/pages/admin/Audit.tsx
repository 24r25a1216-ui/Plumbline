import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { EmptyState, ErrorState, PageHead, SkeletonRows } from '../../components/ui';
import { Icon } from '../../components/Icon';

interface Row { id: number; action: string; target: string; meta: string | null; createdAt: string; actor: string | null; role: string | null }

export default function Audit() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api.get<{ items: Row[] }>('/admin/audit') });
  const [filter, setFilter] = useState('');
  const items = (q.data?.items ?? []).filter((r) => !filter || `${r.action} ${r.target} ${r.actor}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="col gap-20">
      <PageHead index="ADM · 07" eyebrow="Accountability" title={<>Audit <em className="serif-i accent">trail</em></>} sub="Sign-ins, verifications, merges, rejections, exports, access changes and settings updates — the last 200 privileged actions." />
      <section className="sheet">
        <div className="row" style={{ padding: 14, borderBottom: '1px solid var(--line-1)' }}>
          <div className="input-wrap" style={{ width: 320 }}><Icon name="search" /><input className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by action, target or person" aria-label="Filter audit trail" /></div>
        </div>
        {q.isLoading ? <SkeletonRows n={10} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !items.length ? <EmptyState title="Nothing recorded" body={filter ? 'No entries match this filter.' : 'Privileged actions will be listed here.'} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th className="hide-sm">Details</th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="xs muted nowrap">{dateTime(r.createdAt)}</td>
                    <td className="small">{r.actor ?? 'system'}{r.role && <span className="label"> · {r.role}</span>}</td>
                    <td><span className="tag">{r.action}</span></td>
                    <td className="mono xs">{r.target || '—'}</td>
                    <td className="hide-sm xs muted" style={{ maxWidth: 360 }}><span className="clamp-2 mono" style={{ fontSize: 10.5 }}>{r.meta ?? ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
