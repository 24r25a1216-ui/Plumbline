import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { caseBase } from '../../lib/live';
import { ago, hours } from '../../lib/format';
import { ErrorState, PageHead, SheetHead, Skeleton, DomainTag } from '../../components/ui';
import { BarList, Columns, FlowChart, Ring, Sparkline, StackStrip } from '../../components/Charts';
import { Icon } from '../../components/Icon';
import { CountUp } from '../../components/Motion';
import type { Domain } from '../../lib/types';

interface OverviewData {
  kpis: {
    total: number; open: number; awaiting: number; analyzing: number; inProgress: number; resolved: number; escalated: number; overdue: number; p1Open: number;
    last7: number; prev7: number; medianResolutionHours: number | null; slaCompliance: number | null; aiAccuracy: number | null; verified: number; satisfaction: number | null; ratings: number;
  };
  series: { date: string; intake: number; resolved: number }[];
  byDomain: { key: Domain; label: string; total: number; open: number }[];
  byCategory: { category: string; label: string; n: number; open: number; domain: Domain }[];
  severity: { level: number; n: number }[];
  priority: { priority: string; open: number; total: number }[];
  districts: { district: string; n: number; open: number; critical: number }[];
  languages: { language: string; n: number }[];
  departments: { id: number; code: string; name: string; domain: Domain; slaHours: number; open: number; overdue: number; resolved: number; avgHours: number | null; rating: number | null }[];
  activity: { id: number; type: string; message: string; toStatus: string | null; createdAt: string; complaintId: number; ref: string; actor: string | null }[];
  engine: { mode: string; live: number };
}

export default function Overview() {
  const { user } = useSession();
  const admin = user!.role === 'admin';
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get<OverviewData>('/admin/overview'), refetchInterval: 60_000 });

  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const k = d?.kpis;
  const delta = k ? k.last7 - k.prev7 : 0;
  const maxDistrict = Math.max(1, ...(d?.districts ?? []).map((x) => x.n));

  return (
    <div className="col gap-20">
      <PageHead
        index={admin ? 'CELL · 00' : `${user!.department?.code} · 00`}
        eyebrow={admin ? 'Grievance cell · statewide' : user!.department?.name}
        title={<>The state of things, <em className="serif-i accent">today.</em></>}
        actions={
          <>
            <a className="btn" href="/api/complaints/export.csv" download><Icon name="download" /> Export CSV</a>
            {admin ? (
              <Link to="/admin/queue" className="btn btn-primary"><Icon name="inbox" /> Verification queue {k?.awaiting ? <span className="num">· {k.awaiting}</span> : null}</Link>
            ) : (
              <Link to="/desk/cases" className="btn btn-primary"><Icon name="list" /> Open cases</Link>
            )}
          </>
        }
      />

      <div className="grid g-4 stagger">
        <Tile label="Open cases" value={k?.open} sub={k ? <span className={`delta ${delta > 0 ? 'down' : 'up'}`}>{delta >= 0 ? '+' : ''}{delta} intake vs last week</span> : null} spark={d?.series.map((s) => s.intake)} />
        {admin ? (
          <Tile label="Awaiting verification" value={k?.awaiting} sub={k ? <span className="delta">{k.analyzing} analysing now</span> : null} tone={k && k.awaiting > 0 ? 'var(--ochre)' : undefined} />
        ) : (
          <Tile label="In progress" value={k?.inProgress} sub={<span className="delta">assigned · on hold · reopened</span>} />
        )}
        <Tile label="Overdue · escalated" value={k ? `${k.overdue}` : undefined} suffix={k ? ` / ${k.escalated}` : ''} alert={!!k?.overdue} sub={k ? <span className="delta">{k.p1Open} urgent (P1) open</span> : null} />
        <Tile label="Median resolution" value={k?.medianResolutionHours != null ? hours(k.medianResolutionHours) : k ? '—' : undefined} sub={<span className="delta">{k?.resolved ?? '–'} resolved all-time</span>} spark={d?.series.map((s) => s.resolved)} sparkColor="var(--verdigris)" />
      </div>

      <div className="grid g-3">
        <RingTile label="SLA compliance" value={k?.slaCompliance} hint="Resolved before the priority deadline" color="var(--verdigris)" />
        {admin ? (
          <RingTile label="AI routing accuracy" value={k?.aiAccuracy} hint={k ? `${k.verified} human-verified classifications` : ''} color="var(--lichen)" to="/admin/insights" />
        ) : (
          <RingTile label="Share resolved" value={k && k.total ? Math.round((k.resolved / k.total) * 1000) / 10 : null} hint="Of all cases routed to you" color="var(--lichen)" />
        )}
        <RingTile label="Citizen satisfaction" value={k?.satisfaction != null ? (k.satisfaction / 5) * 100 : null} display={k?.satisfaction != null ? `${k.satisfaction}` : '—'} unit="/5" hint={k ? `${k.ratings} ratings` : ''} color="var(--ochre)" />
      </div>

      <div className="grid g-wide">
        <section className="sheet">
          <SheetHead fig="FIG. 1" title="Intake vs resolution · 30 days" right={<span className="row gap-12 xs muted"><span className="row gap-6"><i style={{ width: 12, height: 2, background: 'var(--lichen)' }} />Intake</span><span className="row gap-6"><i style={{ width: 12, height: 0, borderTop: '2px dashed var(--verdigris)' }} />Resolved</span></span>} />
          <div className="sheet-body">{d ? <FlowChart series={d.series} /> : <Skeleton h={220} />}</div>
        </section>
        <section className="sheet">
          <SheetHead fig="FIG. 2" title="Open by priority" />
          <div className="sheet-body col gap-16">
            {d ? (
              <Columns data={d.priority.map((p) => ({ label: p.priority, value: p.open, tone: { P1: 'var(--oxide)', P2: 'var(--clay)', P3: 'var(--ochre)', P4: 'var(--moss)' }[p.priority] }))} height={130} />
            ) : <Skeleton h={150} />}
            <div className="ruler" />
            <span className="label">Severity distribution · all cases</span>
            {d && <StackStrip parts={d.severity.map((s) => ({ label: ['', 'Minimal', 'Low', 'Moderate', 'High', 'Critical'][s.level], value: s.n, color: `var(--sev-${s.level})` }))} />}
          </div>
        </section>
      </div>

      <div className="grid g-2">
        <section className="sheet">
          <SheetHead fig="FIG. 3" title="By domain" />
          <div className="sheet-body col gap-20">
            {d ? d.byDomain.map((x) => (
              <div key={x.key} className="col gap-8">
                <div className="row between"><DomainTag domain={x.key} /><span className="num xs muted">{x.open} open · {x.total} total</span></div>
                <div className="bar-row" style={{ ['--c' as string]: `var(--dom-${x.key})` }}>
                  <div className="track" style={{ height: 10 }}>
                    <b style={{ width: `${(x.total / Math.max(1, ...d.byDomain.map((y) => y.total))) * 100}%` }} />
                    <i style={{ width: `${(x.open / Math.max(1, ...d.byDomain.map((y) => y.total))) * 100}%` }} />
                  </div>
                </div>
              </div>
            )) : <Skeleton h={140} />}
            <div className="xs muted row gap-12"><span className="row gap-6"><i style={{ width: 10, height: 6, background: 'var(--lichen)' }} />Open</span><span className="row gap-6"><i className="hatch" style={{ width: 10, height: 6, color: 'var(--lichen)', opacity: 0.5 }} />Total</span></div>
          </div>
        </section>
        <section className="sheet">
          <SheetHead fig="FIG. 4" title="Top categories" />
          <div className="sheet-body">
            {d ? <BarList rows={d.byCategory.slice(0, 7).map((c) => ({ label: c.label, value: c.n, secondary: c.open, color: `var(--dom-${c.domain})` }))} /> : <Skeleton h={200} />}
          </div>
        </section>
      </div>

      <section className="sheet">
        <SheetHead fig="FIG. 5" title="Geographic load · by district" right={<span className="xs muted">Shade = volume · ◆ = high-severity cases</span>} />
        <div className="sheet-body">
          {d ? (
            <div className="heat">
              {d.districts.map((x) => (
                <div key={x.district} className="heat-cell" style={{ ['--a' as string]: 0.06 + (x.n / maxDistrict) * 0.32 }}>
                  <span className="fill" />
                  <span className="xs ellipsis" style={{ fontWeight: 600 }}>{x.district}</span>
                  <div className="row between">
                    <span className="num" style={{ fontSize: 20 }}>{x.n}</span>
                    <span className="xs muted">{x.open} open{x.critical ? <span style={{ color: 'var(--oxide)' }}> · ◆{x.critical}</span> : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <Skeleton h={160} />}
        </div>
      </section>

      <div className={`grid ${admin ? 'g-wide' : ''}`}>
        {admin && (
          <section className="sheet">
            <SheetHead fig="FIG. 6" title="Department load" right={<Link to="/admin/departments" className="btn btn-ghost btn-sm">Manage</Link>} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Dept</th><th>Open</th><th>Overdue</th><th>Resolved</th><th>Avg time</th><th>Rating</th></tr></thead>
                <tbody>
                  {(d?.departments ?? []).map((x) => (
                    <tr key={x.id}>
                      <td><span className="row gap-8"><DomainTag domain={x.domain} label={x.code} /><span className="xs muted ellipsis hide-sm" style={{ maxWidth: 220 }}>{x.name}</span></span></td>
                      <td className="num">{x.open}</td>
                      <td className="num" style={{ color: x.overdue ? 'var(--oxide)' : 'var(--ink-4)' }}>{x.overdue}</td>
                      <td className="num">{x.resolved}</td>
                      <td className="num muted">{hours(x.avgHours)}</td>
                      <td className="num">{x.rating ? x.rating.toFixed(1) : <span className="dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="sheet">
          <SheetHead fig="FIG. 7" title="Recent activity" right={<span className="chip live" style={{ ['--c' as string]: 'var(--lichen)' }}><span className="dot" />Live</span>} />
          <div style={{ maxHeight: 460, overflow: 'auto' }}>
            {(d?.activity ?? []).map((a) => (
              <Link key={a.id} to={`${caseBase(user!.role)}${a.complaintId}`} className="list-item" style={{ padding: '11px 18px' }}>
                <Icon name={a.type === 'escalation' ? 'alert' : a.type === 'ai' ? 'spark' : a.type === 'comment' ? 'message' : a.type === 'feedback' ? 'star' : a.type === 'correction' ? 'scale' : 'check'} size={15} style={{ color: a.type === 'escalation' ? 'var(--oxide)' : 'var(--ink-3)', marginTop: 2, flex: 'none' }} />
                <div className="col gap-4 grow" style={{ minWidth: 0 }}>
                  <span className="xs ink2 clamp-2">{a.message || a.toStatus}</span>
                  <span className="label" style={{ fontSize: 9 }}>{a.ref} · {ago(a.createdAt)}{a.actor ? ` · ${a.actor}` : ''}</span>
                </div>
              </Link>
            ))}
            {d && !d.activity.length && <p className="small muted" style={{ padding: 18 }}>No activity yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, suffix, sub, spark, sparkColor, alert, tone }: { label: string; value: number | string | undefined; suffix?: string; sub?: React.ReactNode; spark?: number[]; sparkColor?: string; alert?: boolean; tone?: string }) {
  return (
    <div className={`sheet stat reg${alert ? ' alert' : ''}`}>
      <span className="label">{label}</span>
      {value === undefined ? <Skeleton h={42} w={90} /> : <span className="value" style={tone ? { color: tone } : undefined}><CountUp value={typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value} />{suffix && <small>{suffix}</small>}</span>}
      {sub}
      {spark && spark.length > 1 && <Sparkline className="spark" data={spark.slice(-14)} color={sparkColor} />}
    </div>
  );
}

function RingTile({ label, value, display, unit = '%', hint, color, to }: { label: string; value: number | null | undefined; display?: string; unit?: string; hint?: string; color: string; to?: string }) {
  const body = (
    <div className="row gap-16" style={{ padding: '16px 18px' }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <Ring value={value == null ? null : value / 100} size={64} color={color} stroke={4} />
      </div>
      <div className="col gap-4 grow">
        <span className="label">{label}</span>
        <span className="num" style={{ fontSize: 26, letterSpacing: '-0.04em' }}>{value === undefined ? '–' : display ?? (value == null ? '—' : `${value}`)}<span className="small muted">{value != null ? unit : ''}</span></span>
        <span className="xs muted">{hint}</span>
      </div>
      {to && <Icon name="arrowUpRight" size={16} style={{ color: 'var(--ink-3)' }} />}
    </div>
  );
  return to ? <Link to={to} className="sheet" style={{ display: 'block' }}>{body}</Link> : <div className="sheet">{body}</div>;
}
