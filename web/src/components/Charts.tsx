import { useMemo, useState } from 'react';

/* ── Sparkline ────────────────────────────────────────────────── */
export function Sparkline({ data, color = 'var(--lichen)', className }: { data: number[]; color?: string; className?: string }) {
  const w = 160, h = 40;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const id = useMemo(() => `sp${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />}
    </svg>
  );
}

/* ── Dual-series area: intake vs resolved ─────────────────────── */
export function FlowChart({ series }: { series: { date: string; intake: number; resolved: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, pl = 30, pr = 12, pt = 14, pb = 26;
  const iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(4, ...series.map((s) => Math.max(s.intake, s.resolved)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => pl + (i / Math.max(1, series.length - 1)) * iw;
  const y = (v: number) => pt + ih - (v / top) * ih;
  const path = (k: 'intake' | 'resolved') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s[k]).toFixed(1)}`).join(' ');
  const h = hover != null ? series[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="hatch-intake" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--lichen)" strokeWidth="1" opacity=".35" />
          </pattern>
          <linearGradient id="fade-res" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--verdigris)" stopOpacity=".25" />
            <stop offset="1" stopColor="var(--verdigris)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-grid">
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={pl} x2={W - pr} y1={y(i * step)} y2={y(i * step)} />)}
        </g>
        <g className="chart-axis">
          {[0, 1, 2, 3, 4].map((i) => <text key={i} x={pl - 8} y={y(i * step) + 3} textAnchor="end">{i * step}</text>)}
          {series.map((s, i) => (i % 5 === 0 || i === series.length - 1 ? (
            <text key={s.date} x={x(i)} y={H - 6} textAnchor="middle">{new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</text>
          ) : null))}
        </g>
        <path d={`${path('intake')} L${x(series.length - 1)} ${y(0)} L${x(0)} ${y(0)}Z`} fill="url(#hatch-intake)" />
        <path d={path('intake')} fill="none" stroke="var(--lichen)" strokeWidth="1.6" style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: 'draw 1.4s var(--ease-out) forwards' }} />
        <path d={`${path('resolved')} L${x(series.length - 1)} ${y(0)} L${x(0)} ${y(0)}Z`} fill="url(#fade-res)" />
        <path d={path('resolved')} fill="none" stroke="var(--verdigris)" strokeWidth="1.4" strokeDasharray="4 3" />
        {series.map((_, i) => (
          <rect key={i} x={x(i) - iw / series.length / 2} y={pt} width={iw / series.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {h && hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke="var(--line-3)" />
            <circle cx={x(hover)} cy={y(h.intake)} r="3.5" fill="var(--bg-2)" stroke="var(--lichen)" strokeWidth="1.5" />
            <circle cx={x(hover)} cy={y(h.resolved)} r="3.5" fill="var(--bg-2)" stroke="var(--verdigris)" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div
          className="sheet raised"
          style={{ position: 'absolute', top: 0, left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > series.length * 0.7 ? '-105%' : '8px'})`, padding: '8px 10px', pointerEvents: 'none', minWidth: 130 }}
        >
          <div className="label">{new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <div className="row between mt-4 small"><span className="row gap-6"><i style={{ width: 8, height: 2, background: 'var(--lichen)' }} />Intake</span><b className="num">{h.intake}</b></div>
          <div className="row between small"><span className="row gap-6"><i style={{ width: 8, height: 2, background: 'var(--verdigris)' }} />Resolved</span><b className="num">{h.resolved}</b></div>
        </div>
      )}
    </div>
  );
}

/* ── Horizontal bars ──────────────────────────────────────────── */
export function BarList({ rows }: { rows: { label: string; value: number; secondary?: number; color?: string; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col gap-12">
      {rows.map((r, i) => (
        <div key={r.label} className="bar-row" style={{ ['--c' as string]: r.color ?? 'var(--lichen)' }}>
          <span className="small ellipsis ink2" title={r.label}>{r.label}</span>
          <span className="num xs" style={{ textAlign: 'right' }}>
            {r.value}
            {r.secondary != null && <span className="dim"> · {r.secondary}</span>}
          </span>
          <div className="track">
            <b style={{ width: `${(r.value / max) * 100}%` }} />
            <i style={{ width: `${((r.secondary ?? r.value) / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Confidence gauge (drafting protractor) ───────────────────── */
export function Gauge({ value, size = 168, label }: { value: number; size?: number; label?: string }) {
  const r = 64, cx = 80, cy = 78;
  const a = (t: number) => Math.PI * (1 - t);
  const pt = (t: number, rr = r) => [cx + rr * Math.cos(a(t)), cy - rr * Math.sin(a(t))] as const;
  const arc = (t0: number, t1: number, rr = r) => {
    const [x0, y0] = pt(t0, rr), [x1, y1] = pt(t1, rr);
    return `M${x0} ${y0} A${rr} ${rr} 0 ${t1 - t0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const tone = value >= 0.75 ? 'var(--verdigris)' : value >= 0.5 ? 'var(--ochre)' : 'var(--oxide)';
  const [nx, ny] = pt(value, r - 14);
  return (
    <svg viewBox="0 0 160 96" width={size} style={{ overflow: 'visible' }} role="img" aria-label={`${Math.round(value * 100)}% confidence`}>
      {Array.from({ length: 41 }).map((_, i) => {
        const t = i / 40;
        const [x0, y0] = pt(t, r + 6);
        const [x1, y1] = pt(t, r + (i % 10 === 0 ? 13 : i % 5 === 0 ? 10 : 8));
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--line-3)" strokeWidth={i % 10 === 0 ? 1.2 : 0.8} />;
      })}
      <path d={arc(0, 1)} fill="none" stroke="var(--line-2)" strokeWidth="6" />
      <path d={arc(0, 0.5)} fill="none" stroke="var(--oxide)" strokeWidth="1" opacity=".5" transform="translate(0 0)" />
      <path d={arc(0.001, Math.max(0.002, value))} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="butt" style={{ strokeDasharray: 400, strokeDashoffset: 400, animation: 'draw 1.2s var(--ease-out) forwards' }} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink-1)" strokeWidth="1.4" />
      <circle cx={cx} cy={cy} r="3.5" fill="var(--bg-2)" stroke="var(--ink-1)" strokeWidth="1.4" />
      <text x={cx} y={cy - 18} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 26, fill: 'var(--ink-1)', fontWeight: 600 }}>{Math.round(value * 100)}<tspan style={{ fontSize: 12, fill: 'var(--ink-3)' }}>%</tspan></text>
      {label && <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', fill: 'var(--ink-3)', textTransform: 'uppercase' }}>{label}</text>}
    </svg>
  );
}

/* ── Ring percentage ──────────────────────────────────────────── */
export function Ring({ value, size = 56, color = 'var(--lichen)', stroke = 5 }: { value: number | null; size?: number; color?: string; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 1s var(--ease-out)' }} />
    </svg>
  );
}

/* ── Stacked strip (distribution) ─────────────────────────────── */
export function StackStrip({ parts, height = 12 }: { parts: { label: string; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="col gap-12">
      <div className="row" style={{ gap: 2, height }}>
        {parts.map((p) => p.value > 0 && (
          <div key={p.label} title={`${p.label}: ${p.value}`} style={{ flex: p.value / total, height: '100%', background: p.color, borderRadius: 2, minWidth: 3 }} />
        ))}
      </div>
      <div className="row wrap gap-16">
        {parts.map((p) => (
          <span key={p.label} className="row gap-6 xs muted">
            <i style={{ width: 8, height: 8, background: p.color, borderRadius: 1 }} />
            {p.label} <b className="num ink2">{p.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Column histogram ─────────────────────────────────────────── */
export function Columns({ data, height = 110, color = 'var(--lichen)' }: { data: { label: string; value: number; tone?: string }[]; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="row" style={{ alignItems: 'flex-end', gap: 10, height: height + 22 }}>
      {data.map((d, i) => (
        <div key={d.label} className="col center" style={{ flex: 1, gap: 6 }}>
          <span className="num xs muted">{d.value}</span>
          <div style={{ width: '100%', maxWidth: 40, height: Math.max(2, (d.value / max) * height), background: d.tone ?? color, borderRadius: '2px 2px 0 0', transformOrigin: 'bottom', animation: `rise .7s ${i * 60}ms var(--ease-out) both` }} />
          <span className="label" style={{ fontSize: 9.5 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
