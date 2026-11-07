import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { useSession, useTheme, homeFor } from '../lib/session';
import { useLive, caseBase } from '../lib/live';
import { ago } from '../lib/format';
import type { Notification, Paged, ComplaintSummary, Role } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { Avatar, Brand, IconButton, Kbd, StatusChip } from './ui';
import { Orbs } from './Motion';

/* ── Guards ───────────────────────────────────────────────────── */

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useSession();
  const loc = useLocation();
  if (loading) return <BootScreen />;
  if (!user) return <Navigate to={roles.includes('citizen') ? '/login' : '/staff/login'} replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

export function BootScreen() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div className="col center gap-12">
        <svg width="40" height="64" viewBox="0 0 40 64" aria-hidden>
          <path d="M8 4h24" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" />
          <g style={{ transformOrigin: '20px 4px', animation: 'sway 1.6s ease-in-out infinite' }}>
            <path d="M20 4v38" stroke="var(--ink-3)" strokeDasharray="2 3" />
            <path d="M20 42l-6 6 6 9 6-9z" fill="var(--lichen)" />
          </g>
        </svg>
        <span className="label">Calibrating</span>
      </div>
    </div>
  );
}

/* ── Navigation model ─────────────────────────────────────────── */

export const accountPath = (role: Role) => (role === 'admin' ? '/admin/account' : role === 'officer' ? '/desk/settings' : '/app/settings');

interface NavItem { to: string; label: string; icon: IconName; end?: boolean; count?: number; hot?: boolean }

function useCounts(role: Role) {
  return useQuery({
    queryKey: ['counts', role],
    queryFn: async () => {
      const all = await api.get<Paged<ComplaintSummary>>(`/complaints${qs({ pageSize: 5 })}`);
      const esc = role === 'citizen' ? null : await api.get<Paged<ComplaintSummary>>(`/complaints${qs({ pageSize: 5, escalated: 1, status: 'open' })}`);
      return { status: all.statusCounts, escalated: esc?.total ?? 0 };
    },
    refetchInterval: 60_000,
  });
}

function navFor(role: Role, c?: { status: Record<string, number>; escalated: number }): { section: string; items: NavItem[] }[] {
  const s = c?.status ?? {};
  const open = (['assigned', 'in_progress', 'on_hold', 'reopened'] as const).reduce((a, k) => a + (s[k] ?? 0), 0);
  if (role === 'citizen') {
    return [
      { section: 'Grievances', items: [
        { to: '/app', label: 'My complaints', icon: 'home', end: true },
        { to: '/app/new', label: 'File a complaint', icon: 'plus' },
      ] },
      { section: 'Account', items: [{ to: '/app/settings', label: 'Profile & security', icon: 'user' }] },
    ];
  }
  if (role === 'officer') {
    return [
      { section: 'Department desk', items: [
        { to: '/desk', label: 'Overview', icon: 'gauge', end: true },
        { to: '/desk/cases', label: 'Case registry', icon: 'list', count: open || undefined },
        { to: '/desk/escalations', label: 'Escalations', icon: 'alert', count: c?.escalated || undefined, hot: !!c?.escalated },
      ] },
      { section: 'Account', items: [{ to: '/desk/settings', label: 'Profile & security', icon: 'user' }] },
    ];
  }
  return [
    { section: 'Command', items: [
      { to: '/admin', label: 'Overview', icon: 'gauge', end: true },
      { to: '/admin/queue', label: 'Verification queue', icon: 'inbox', count: s.awaiting_verification || undefined, hot: (s.awaiting_verification ?? 0) > 0 },
      { to: '/admin/complaints', label: 'Case registry', icon: 'list' },
      { to: '/admin/escalations', label: 'Escalations', icon: 'alert', count: c?.escalated || undefined, hot: !!c?.escalated },
    ] },
    { section: 'Intelligence', items: [{ to: '/admin/insights', label: 'AI insights & learning', icon: 'spark' }] },
    { section: 'Administration', items: [
      { to: '/admin/departments', label: 'Departments', icon: 'building' },
      { to: '/admin/authorities', label: 'Authority emails', icon: 'mail' },
      { to: '/admin/users', label: 'People & access', icon: 'users' },
      { to: '/admin/settings', label: 'System settings', icon: 'settings' },
      { to: '/admin/audit', label: 'Audit trail', icon: 'log' },
    ] },
  ];
}

/* ── Shell ────────────────────────────────────────────────────── */

export function AppShell() {
  const { user, logout } = useSession();
  const { theme, toggle } = useTheme();
  const { connected } = useLive();
  const loc = useLocation();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const counts = useCounts(user!.role);
  const nav = navFor(user!.role, counts.data);
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<{ engine: string; model: string }>('/meta/stats'), staleTime: 60_000 });
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications'), refetchInterval: 120_000 });

  useEffect(() => setRailOpen(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const crumbs = useMemo(() => {
    const parts = loc.pathname.split('/').filter(Boolean);
    const area = { app: 'Citizen', admin: 'Grievance cell', desk: user!.department?.code ?? 'Department' }[parts[0]] ?? '';
    const flat = nav.flatMap((n) => n.items);
    const match = flat.filter((i) => loc.pathname === i.to || (!i.end && loc.pathname.startsWith(i.to + '/'))).sort((a, b) => b.to.length - a.to.length)[0];
    const leaf = parts.includes('c') ? 'Case file' : match?.label ?? '';
    return [area, leaf].filter(Boolean);
  }, [loc.pathname, nav, user]);

  const engineOn = stats.data?.engine === 'openai';

  return (
    <div className="shell">
      <div className={`rail-scrim${railOpen ? ' open' : ''}`} onClick={() => setRailOpen(false)} />
      <aside className={`rail${railOpen ? ' open' : ''}`} aria-label="Primary">
        <div className="rail-brand">
          <Brand to={homeFor(user!.role)} />
          <span className="grow" />
          <span className="tag" style={{ height: 20, fontSize: 9.5 }}>{user!.role === 'admin' ? 'CELL' : user!.role === 'officer' ? user!.department?.code ?? 'DEPT' : 'CITIZEN'}</span>
        </div>
        <div className="ruler" style={{ margin: '0 18px' }} />
        <nav className="rail-nav">
          {nav.map((g) => (
            <div className="rail-section" key={g.section}>
              <span className="label">{g.section}</span>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  <Icon name={it.icon} />
                  <span>{it.label}</span>
                  {it.count != null && <span className={`count${it.hot ? ' hot' : ''}`}>{it.count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
          {user!.role === 'citizen' && (
            <div className="rail-section">
              <div className="sheet sunken" style={{ padding: 14, margin: '6px 2px' }}>
                <span className="label">Write in any language</span>
                <p className="small ink2 mt-8" style={{ lineHeight: 1.6 }}>
                  English, <span lang="hi">हिन्दी</span> or <span lang="te">తెలుగు</span> — we detect and translate automatically.
                </p>
              </div>
            </div>
          )}
        </nav>
        <div className="rail-foot">
          <div className="row gap-6">
            <button className="btn btn-ghost btn-sm grow" onClick={toggle} style={{ justifyContent: 'flex-start' }}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'Light' : 'Dark'} theme
            </button>
            <IconButton icon="logout" label="Sign out" onClick={async () => { await logout(); navigate(user!.role === 'citizen' ? '/login' : '/staff/login'); }} />
          </div>
          <Link to={accountPath(user!.role)} className="user-card" title="Profile & security">
            <Avatar name={user!.name} />
            <div className="col" style={{ gap: 0, minWidth: 0 }}>
              <span className="small ellipsis" style={{ fontWeight: 600 }}>{user!.name}</span>
              <span className="xs muted ellipsis">{user!.email}</span>
            </div>
          </Link>
        </div>
      </aside>

      <div className="main">
        <div className="ambient" aria-hidden><Orbs n={3} /></div>
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setRailOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="crumbs grow">
            {crumbs.map((c, i) => (
              <span key={i} className="row gap-8" style={{ minWidth: 0 }}>
                {i > 0 && <span className="sep">/</span>}
                <span className={i === crumbs.length - 1 ? 'small ellipsis' : 'label'} style={i === crumbs.length - 1 ? { fontWeight: 600 } : undefined}>{c}</span>
              </span>
            ))}
          </div>
          <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search and jump (Ctrl K)">
            <Icon name="search" />
            <span className="grow" style={{ textAlign: 'left' }}>Jump to case, page…</span>
            <Kbd>⌘K</Kbd>
          </button>
          {user!.role !== 'citizen' && (
            <span className={`engine-pill hide-sm${engineOn ? '' : ' off'}`} title={engineOn ? `OpenAI · ${stats.data?.model}` : 'Local NLP engine'}>
              <span className="dot" />
              {engineOn ? 'OpenAI' : 'Local NLP'}
            </span>
          )}
          <span className={`engine-pill hide-sm${connected ? '' : ' off'}`} title={connected ? 'Live updates connected' : 'Reconnecting…'}>
            <span className="dot" style={{ background: connected ? 'var(--lichen)' : undefined, color: 'var(--lichen)' }} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <IconButton icon="bell" label="Notifications" badge={notes.data?.unread} onClick={() => setNotesOpen(true)} />
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} nav={nav.flatMap((n) => n.items)} role={user!.role} />}
      {notesOpen && <NotificationsDrawer onClose={() => setNotesOpen(false)} data={notes.data} role={user!.role} />}
    </div>
  );
}

/* ── Command palette ──────────────────────────────────────────── */

function CommandPalette({ onClose, nav, role }: { onClose: () => void; nav: NavItem[]; role: Role }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useQuery({
    queryKey: ['palette', q],
    queryFn: () => api.get<Paged<ComplaintSummary>>(`/complaints${qs({ q, pageSize: 6, sort: 'updated' })}`),
    enabled: q.trim().length >= 2,
    placeholderData: (p) => p,
  });

  type Item = { key: string; icon: IconName; label: ReactNode; hint?: ReactNode; run: () => void };
  const items: Item[] = [
    ...(q.trim().length >= 2 ? (search.data?.items ?? []).map((c) => ({
      key: `c${c.id}`, icon: 'file' as IconName,
      label: <span className="row gap-8" style={{ minWidth: 0 }}><span className="mono xs muted">{c.ref}</span><span className="ellipsis">{c.title}</span></span>,
      hint: <StatusChip status={c.status} />, run: () => navigate(`${caseBase(role)}${c.id}`),
    })) : []),
    ...nav.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => ({ key: n.to, icon: n.icon, label: n.label, hint: <span className="label">Go to</span>, run: () => navigate(n.to) })),
    ...(!q || 'theme toggle dark light'.includes(q.toLowerCase()) ? [{ key: 'theme', icon: 'sun' as IconName, label: 'Toggle light / dark theme', run: toggle }] : []),
  ];

  useEffect(() => setSel(0), [q]);
  useEffect(() => inputRef.current?.focus(), []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === 'Enter' && items[sel]) { items[sel].run(); onClose(); }
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette reg" role="dialog" aria-label="Command palette" onKeyDown={onKey}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" style={{ position: 'absolute', left: 18, top: 19, color: 'var(--ink-3)' }} size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, title, place… or jump to a page" aria-label="Search" />
        </div>
        <div className="palette-list" role="listbox">
          {search.isFetching && <div className="row gap-8 small muted" style={{ padding: '8px 12px' }}><span className="spinner" /> Searching</div>}
          {items.length === 0 && !search.isFetching && <div className="small muted" style={{ padding: 14 }}>No matches for “{q}”.</div>}
          {items.map((it, i) => (
            <button key={it.key} className="palette-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => { it.run(); onClose(); }}>
              <Icon name={it.icon} />
              <span className="grow" style={{ minWidth: 0 }}>{it.label}</span>
              {it.hint}
            </button>
          ))}
        </div>
        <div className="row gap-16 xs muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--line-1)' }}>
          <span className="row gap-6"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="row gap-6"><Kbd>↵</Kbd> open</span>
          <span className="row gap-6"><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Notifications ────────────────────────────────────────────── */

const KIND_TONE: Record<string, string> = { urgent: 'var(--oxide)', escalation: 'var(--oxide)', success: 'var(--verdigris)', warning: 'var(--ochre)', review: 'var(--ochre)', assignment: 'var(--sand)', progress: 'var(--lichen)', message: 'var(--verdigris)' };

function NotificationsDrawer({ onClose, data, role }: { onClose: () => void; data?: { items: Notification[]; unread: number }; role: Role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: number) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Notifications">
        <div className="sheet-head" style={{ minHeight: 60 }}>
          <span className="title grow">Notifications</span>
          {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && <button className="btn btn-ghost btn-sm" onClick={() => { void Notification.requestPermission(); }}><Icon name="bell" /> Enable device alerts</button>}
          {!!data?.unread && <button className="btn btn-ghost btn-sm" onClick={() => readAll.mutate()}><Icon name="check" /> Mark all read</button>}
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {!data?.items.length && <div className="empty"><p>You're all caught up. Updates on your cases will appear here in real time.</p></div>}
          {data?.items.map((n) => (
            <button
              key={n.id}
              className="list-item"
              style={{ width: '100%', textAlign: 'left', opacity: n.read_at ? 0.62 : 1 }}
              onClick={() => {
                if (!n.read_at) readOne.mutate(n.id);
                if (n.complaint_id) { navigate(`${caseBase(role)}${n.complaint_id}`); onClose(); }
              }}
            >
              <span style={{ width: 8, height: 8, marginTop: 6, flex: 'none', transform: 'rotate(45deg)', background: n.read_at ? 'transparent' : KIND_TONE[n.kind] ?? 'var(--lichen)', border: `1.5px solid ${KIND_TONE[n.kind] ?? 'var(--lichen)'}` }} />
              <span className="col gap-4 grow">
                <span className="small" style={{ fontWeight: 600 }}>{n.title}</span>
                {n.body && <span className="xs muted clamp-2">{n.body}</span>}
                <span className="label" style={{ fontSize: 9.5 }}>{ago(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>,
    document.body,
  );
}
