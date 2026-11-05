import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useSession, useTheme, homeFor } from '../../lib/session';
import type { User } from '../../lib/types';
import { Brand, Button, Field, Segmented } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Orbs } from '../../components/Motion';

/** Always-visible switch so officials can find their own sign-in. */
function PortalSwitch({ current }: { current: 'citizen' | 'staff' }) {
  return (
    <div className="seg" role="tablist" aria-label="Choose portal" style={{ alignSelf: 'flex-start' }}>
      <Link to="/login" role="tab" aria-selected={current === 'citizen'} className="portal-tab"><Icon name="user" size={14} /> Citizen</Link>
      <Link to="/staff/login" role="tab" aria-selected={current === 'staff'} className="portal-tab"><Icon name="shield" size={14} /> Official / Admin</Link>
    </div>
  );
}

function AuthLayout({ staff, children, quote }: { staff?: boolean; children: ReactNode; quote: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="auth">
      <aside className={`auth-art${staff ? ' staff' : ''}`} style={{ backgroundImage: 'url(/assets/auth-art.png)' }}>
        <Orbs n={2} />
        <div className="auth-float sheet raised hide-sm" aria-hidden>
          <div className="col gap-10" style={{ padding: 16 }}>
            <div className="row between"><span className="mono xs muted">{staff ? 'QUEUE' : 'PLB-2610-00417'}</span><span className="chip live" style={{ ['--c' as string]: 'var(--lichen)' }}><span className="dot" />{staff ? 'Live' : 'In progress'}</span></div>
            <strong style={{ fontSize: 14 }}>{staff ? '6 complaints awaiting verification' : 'Drinking water supply restored'}</strong>
            <div className="simbar"><i style={{ width: staff ? '64%' : '82%', ['--c' as string]: 'var(--lichen)' }} /></div>
            <div className="row between xs muted"><span>{staff ? 'AI confidence 94%' : 'Water Board · KPHB'}</span><span>{staff ? '2 flagged' : '2h ago'}</span></div>
          </div>
        </div>
        <div className="row between">
          <Brand />
          <span className="tag">{staff ? 'OFFICIALS · RESTRICTED' : 'CITIZEN ACCESS'}</span>
        </div>
        <div className="col gap-24">
          <div className="auth-quote rise">{quote}</div>
          <div className="ruler" style={{ maxWidth: 420 }} />
          <div className="row gap-24 wrap">
            {(staff
              ? [['Role-scoped', 'access'], ['Every action', 'audited'], ['Sessions', 'revocable']]
              : [['3 languages', 'understood'], ['Live status', 'every step'], ['Human-verified', 'routing']]
            ).map(([a, b]) => (
              <div key={a} className="col gap-4">
                <span className="small" style={{ fontWeight: 600 }}>{a}</span>
                <span className="label">{b}</span>
              </div>
            ))}
          </div>
        </div>
        <span className="xs dim">Plumbline · Multi-domain grievance management</span>
      </aside>
      <main className="auth-panel">
        <div className="row end" style={{ position: 'absolute', top: 20, right: 24 }}>
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
        {children}
      </main>
    </div>
  );
}

function useLogin(endpoint: string) {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ msg: string; redirect?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault();
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const r = await api.post<{ user: User }>(endpoint, override ?? { email, password });
      setUser(r.user);
      const from = loc.state?.from;
      navigate(from && from.startsWith(homeFor(r.user.role)) ? from : homeFor(r.user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError({ msg: err.message, redirect: err.redirect });
      } else setFormError({ msg: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };
  return { email, setEmail, password, setPassword, errors, formError, busy, submit };
}

function PasswordInput({ value, onChange, autoComplete, id }: { value: string; onChange: (v: string) => void; autoComplete: string; id?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input id={id} className="input" style={{ paddingRight: 44 }} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" className="icon-btn suffix" style={{ width: 28, height: 28 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name="eye" size={15} />
      </button>
    </div>
  );
}

export function CitizenLogin() {
  const { user } = useSession();
  const f = useLogin('/auth/login');
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <AuthLayout quote={<>Your complaint, <em>heard</em> in the language you think in.</>}>
      <form className="auth-form rise" onSubmit={f.submit} noValidate>
        <PortalSwitch current="citizen" />
        <div className="col gap-8">
          <span className="label">Sign in · Citizen</span>
          <h1 className="h1">Welcome back.</h1>
          <p className="muted">Track complaints, add evidence and hear from officials.</p>
        </div>
        {f.formError && (
          <div className="callout danger">
            <Icon name="alert" />
            <span>{f.formError.msg} {f.formError.redirect && <Link className="accent" to={f.formError.redirect}>Go there →</Link>}</span>
          </div>
        )}
        <Field label="Email" error={f.errors.email}>
          <input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@example.in" />
        </Field>
        <Field label="Password" error={f.errors.password}>
          <PasswordInput value={f.password} onChange={f.setPassword} autoComplete="current-password" />
        </Field>
        <Button variant="primary" size="lg" block loading={f.busy} type="submit" iconRight="arrowRight">Sign in</Button>
        <p className="small muted" style={{ textAlign: 'center' }}>New here? <Link to="/register" className="accent">Create an account</Link> · <Link to="/staff/login" className="ink2">Staff portal</Link></p>
        <DemoCreds onPick={(e, p) => f.submit(undefined, { email: e, password: p })} items={[['Demo citizen', 'citizen@plumbline.in', 'Citizen@123']]} />
      </form>
    </AuthLayout>
  );
}

export function StaffLogin() {
  const { user } = useSession();
  const f = useLogin('/auth/staff/login');
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <AuthLayout staff quote={<>Verify the machine. <em>Answer</em> the citizen.</>}>
      <form className="auth-form rise" onSubmit={f.submit} noValidate>
        <PortalSwitch current="staff" />
        <div className="col gap-8">
          <span className="label row gap-6"><Icon name="shield" size={13} /> Staff portal · Role-based access</span>
          <h1 className="h1">Officials sign-in.</h1>
          <p className="muted">For the grievance cell and department officers. All access is logged.</p>
        </div>
        {f.formError && (
          <div className="callout danger">
            <Icon name="alert" />
            <span>{f.formError.msg} {f.formError.redirect && <Link className="accent" to={f.formError.redirect}>Go there →</Link>}</span>
          </div>
        )}
        <Field label="Official email" error={f.errors.email}>
          <input className="input" type="email" autoComplete="username" value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="name@plumbline.gov.in" />
        </Field>
        <Field label="Password" error={f.errors.password}>
          <PasswordInput value={f.password} onChange={f.setPassword} autoComplete="current-password" />
        </Field>
        <Button variant="primary" size="lg" block loading={f.busy} type="submit" iconRight="arrowRight">Enter workspace</Button>
        <p className="small muted" style={{ textAlign: 'center' }}>Citizen? <Link to="/login" className="accent">Use the public sign-in</Link></p>
        <DemoCreds
          onPick={(e, p) => f.submit(undefined, { email: e, password: p })}
          items={[
            ['Grievance cell admin', 'admin@plumbline.gov.in', 'Admin@123'],
            ['Water Board officer', 'wsb.officer@plumbline.gov.in', 'Officer@123'],
            ['Municipal officer', 'mad.officer@plumbline.gov.in', 'Officer@123'],
          ]}
        />
      </form>
    </AuthLayout>
  );
}

function DemoCreds({ items, onPick }: { items: [string, string, string][]; onPick: (email: string, pw: string) => void }) {
  return (
    <div className="demo-creds">
      <span className="label">Demo accounts · one-click</span>
      {items.map(([label, email, pw]) => (
        <button key={email} type="button" onClick={() => onPick(email, pw)}>
          <span>{label}</span>
          <span className="mono xs dim">{email}</span>
        </button>
      ))}
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function Register() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', preferredLang: 'en' as 'en' | 'hi' | 'te' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const st = strength(form.password);
  const stTone = ['var(--line-2)', 'var(--oxide)', 'var(--ochre)', 'var(--lichen)', 'var(--verdigris)'][st];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email address.';
    if (form.password.length < 8) local.password = 'Use at least 8 characters.';
    if (form.phone && !/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(form.phone.trim())) local.phone = 'Enter a valid 10-digit mobile number.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setFormError('');
    try {
      const r = await api.post<{ user: User }>('/auth/register', form);
      setUser(r.user);
      navigate('/app/new', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setFormError(err.message); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout quote={<>One account. <em>Every</em> department.</>}>
      <form className="auth-form rise" onSubmit={submit} noValidate>
        <div className="col gap-8">
          <span className="label">Create account · Citizen</span>
          <h1 className="h1">Be heard, on record.</h1>
          <p className="muted">It takes under a minute. Your details are only shared with the officials handling your case.</p>
        </div>
        {formError && !Object.keys(errors).length && <div className="callout danger"><Icon name="alert" /><span>{formError}</span></div>}
        <Field label="Full name" error={errors.name}>
          <input className="input" autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
        </Field>
        <Field label="Mobile" optional error={errors.phone} hint="For status updates. Never shown publicly.">
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="98480 12345" />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <div className="col gap-6" style={{ marginTop: -8 }}>
          <div className="pw-meter">{[1, 2, 3, 4].map((i) => <i key={i} style={{ background: i <= st ? stTone : undefined }} />)}</div>
          <span className="xs muted">{['8+ characters with letters and numbers', 'Weak', 'Fair', 'Good', 'Strong'][st]}</span>
        </div>
        <Field label="Preferred language">
          <Segmented value={form.preferredLang} onChange={(v) => setForm((f) => ({ ...f, preferredLang: v }))} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: <span lang="hi">हिन्दी</span> }, { value: 'te', label: <span lang="te">తెలుగు</span> }]} />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} type="submit" iconRight="arrowRight">Create account</Button>
        <p className="small muted" style={{ textAlign: 'center' }}>Already registered? <Link to="/login" className="accent">Sign in</Link></p>
      </form>
    </AuthLayout>
  );
}
