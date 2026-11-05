import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { STATUS_LABEL, STATUS_TONE, SEV_LABEL, initials } from '../lib/format';
import type { Status, Priority, Domain } from '../lib/types';

/* ── Brand ─────────────────────────────────────────────────────── */

export function Brand({ compact, to = '/' }: { compact?: boolean; to?: string }) {
  return (
    <Link to={to} className="row gap-8" aria-label="Plumbline home" style={{ alignItems: 'center' }}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect x=".5" y=".5" width="27" height="27" rx="6.5" fill="var(--bg-3)" stroke="var(--line-2)" />
        <path d="M8 5.5h12" stroke="var(--ink-1)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 5.5v9.5" stroke="var(--ink-1)" strokeWidth="1.2" />
        <g style={{ transformOrigin: '14px 5.5px', animation: 'sway 5s ease-in-out infinite' }}>
          <path d="M14 15l-3.6 3.6L14 23l3.6-4.4z" fill="var(--lichen)" />
        </g>
      </svg>
      {!compact && (
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
          Plumb<span style={{ color: 'var(--lichen)' }}>line</span>
        </span>
      )}
    </Link>
  );
}

/* ── Form field ────────────────────────────────────────────────── */

export function Field({
  label, hint, error, optional, children, counter,
}: { label?: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode; counter?: ReactNode }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, { id: (children as ReactElement<any>).props.id ?? id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined })
    : children;
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          <span>{label}</span>
          {optional ? <span className="opt">Optional</span> : counter}
        </label>
      )}
      {child}
      {error ? <span className="field-error" id={`${id}-err`} role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/* ── Buttons ───────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'danger-solid' | 'default';
  size?: 'sm' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
};
export function Button({ variant = 'default', size, icon, iconRight, loading, block, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button
      className={`btn ${variant !== 'default' ? `btn-${variant}` : ''} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight && <Icon name={iconRight} className="arrow" />}
    </button>
  );
}

export function IconButton({ icon, label, badge, ...rest }: { icon: IconName; label: string; badge?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-btn" aria-label={label} data-tip={label} {...rest}>
      <Icon name={icon} />
      {!!badge && <span className="badge-dot">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Status / priority / severity / domain ─────────────────────── */

export function StatusChip({ status, live }: { status: Status; live?: boolean }) {
  return (
    <span className={`chip${live || status === 'analyzing' ? ' live' : ''}`} style={{ ['--c' as string]: STATUS_TONE[status] }}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityStamp({ p, lg }: { p: Priority | null | undefined; lg?: boolean }) {
  if (!p) return <span className="dim mono xs">—</span>;
  const title = { P1: 'Urgent', P2: 'High', P3: 'Normal', P4: 'Low' }[p];
  return <span className={`stamp ${p}${lg ? ' lg' : ''}`} title={`${p} · ${title}`}>{p}</span>;
}

export function Severity({ level, showLabel = true, lg }: { level: number | null | undefined; showLabel?: boolean; lg?: boolean }) {
  if (!level) return <span className="dim mono xs">—</span>;
  const c = `var(--sev-${level})`;
  return (
    <span className={`sev${lg ? ' lg' : ''}`} style={{ ['--c' as string]: c }} title={`Severity ${level}/5 · ${SEV_LABEL[level]}`}>
      <span className="sev-cells">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={`${i <= level ? 'on' : ''}${i === level ? ' top' : ''}`} />)}
      </span>
      {showLabel && <span className="small" style={{ color: c, fontWeight: 550 }}>{SEV_LABEL[level]}</span>}
    </span>
  );
}

export function DomainTag({ domain, label }: { domain: Domain | null | undefined; label?: string }) {
  if (!domain) return <span className="dim small">Unclassified</span>;
  const l = label ?? { education: 'Education', healthcare: 'Healthcare', public_service: 'Public Service' }[domain];
  return (
    <span className="domain-tag" style={{ ['--c' as string]: `var(--dom-${domain})` }}>
      <i />
      {l}
    </span>
  );
}

export function Avatar({ name, sm, tone }: { name: string; sm?: boolean; tone?: string }) {
  return <span className={`avatar${sm ? ' sm' : ''}`} style={tone ? { background: tone } : undefined} aria-hidden>{initials(name) || '·'}</span>;
}

/* ── Layout bits ───────────────────────────────────────────────── */

export function PageHead({ eyebrow, title, sub, actions, index }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; index?: string }) {
  return (
    <header className="page-head rise">
      <div className="col gap-4" style={{ minWidth: 0 }}>
        {(eyebrow || index) && (
          <div className="eyebrow">
            {index && <span className="tag">{index}</span>}
            {eyebrow && <span className="label">{eyebrow}</span>}
          </div>
        )}
        <h1 className="h1">{title}</h1>
        {sub && <p className="lead mt-8">{sub}</p>}
      </div>
      {actions && <div className="row wrap gap-8">{actions}</div>}
    </header>
  );
}

export function SheetHead({ fig, title, right, icon }: { fig?: string; title: ReactNode; right?: ReactNode; icon?: IconName }) {
  return (
    <div className="sheet-head">
      {fig && <span className="fig">{fig}</span>}
      {icon && <Icon name={icon} size={16} style={{ color: 'var(--ink-3)' }} />}
      <span className="title grow">{title}</span>
      {right}
    </div>
  );
}

/* ── States ────────────────────────────────────────────────────── */

export function Skeleton({ h = 14, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}

export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="col gap-12" style={{ padding: 18 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="row gap-12">
          <Skeleton h={12} w={90} />
          <Skeleton h={12} w={`${40 + ((i * 17) % 40)}%`} />
          <span className="grow" />
          <Skeleton h={12} w={60} />
        </div>
      ))}
    </div>
  );
}

/* Drafting-style empty illustration: a plumb line over a level surface */
function EmptyArt() {
  return (
    <svg className="art" viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M10 76h100" />
      {Array.from({ length: 11 }).map((_, i) => <path key={i} d={`M${12 + i * 9.6} 76v${i % 5 === 0 ? 6 : 3}`} />)}
      <path d="M40 10h40" strokeWidth="1.4" />
      <path d="M60 10v40" strokeDasharray="2 3" />
      <g style={{ transformOrigin: '60px 10px', animation: 'sway 4s ease-in-out infinite' }}>
        <path d="M60 50 54 57l6 9 6-9z" fill="var(--bg-3)" />
      </g>
      <path d="M60 66v10" strokeDasharray="1 2" opacity=".6" />
    </svg>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty rise">
      <img className="art-img" src="/assets/empty-inbox.png" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
      <span className="hidden"><EmptyArt /></span>
      <h3 className="h3">{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = (error as Error)?.message ?? 'Something went wrong.';
  const status = (error as { status?: number })?.status;
  return (
    <div className="empty">
      <div className="callout danger" style={{ maxWidth: 460, textAlign: 'left' }}>
        <Icon name="alert" />
        <div className="col gap-4">
          <strong style={{ color: 'var(--ink-1)' }}>{status === 404 ? 'Not found' : status === 403 ? 'Access denied' : status === 0 ? 'Offline' : 'Could not load this'}</strong>
          <span>{msg}</span>
        </div>
      </div>
      {retry && status !== 404 && status !== 403 && <Button icon="refresh" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
