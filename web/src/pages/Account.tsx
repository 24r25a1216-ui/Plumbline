import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession, useTheme } from '../lib/session';
import { dateTime } from '../lib/format';
import type { User } from '../lib/types';
import { Avatar, Button, Field, PageHead, Segmented, SheetHead } from '../components/ui';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';

export default function Account() {
  const { user, setUser } = useSession();
  const { theme, set: setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [p, setP] = useState({ name: user!.name, phone: user!.phone, preferredLang: user!.preferredLang });
  const [pErr, setPErr] = useState<Record<string, string>>({});
  const [pBusy, setPBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const dirty = p.name !== user!.name || p.phone !== user!.phone || p.preferredLang !== user!.preferredLang;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setPBusy(true);
    setPErr({});
    try {
      const r = await api.patch<{ user: User }>('/auth/me', p);
      setUser(r.user);
      toast.push({ title: 'Profile updated', tone: 'success' });
    } catch (err) {
      if (err instanceof ApiError) setPErr(err.fields);
      toast.error(err);
    } finally {
      setPBusy(false);
    }
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setPwErr({ confirm: 'Passwords do not match.' }); return; }
    setPwBusy(true);
    setPwErr({});
    try {
      await api.post('/auth/me/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      toast.push({ title: 'Password changed', body: 'Other devices have been signed out.', tone: 'success' });
    } catch (err) {
      if (err instanceof ApiError) setPwErr(err.fields);
      if (!(err instanceof ApiError && Object.keys(err.fields).length)) toast.error(err);
    } finally {
      setPwBusy(false);
    }
  };

  const revokeAll = async () => {
    await api.post('/auth/logout-all').catch(() => {});
    setUser(null);
    navigate(user!.role === 'citizen' ? '/login' : '/staff/login');
  };

  return (
    <div className="col gap-20" style={{ maxWidth: 860 }}>
      <PageHead eyebrow="Account" title="Profile & security" />

      <section className="sheet reg">
        <div className="row gap-16" style={{ padding: 22 }}>
          <Avatar name={user!.name} />
          <div className="col gap-4 grow">
            <span className="h3">{user!.name}</span>
            <span className="small muted">{user!.email} · {user!.role === 'officer' ? `Officer, ${user!.department?.name}` : user!.role === 'admin' ? 'Grievance cell administrator' : 'Citizen'}</span>
          </div>
          <span className="label hide-sm">Last sign-in {dateTime(user!.lastLoginAt)}</span>
        </div>
      </section>

      <form className="sheet" onSubmit={saveProfile}>
        <SheetHead fig="01" title="Profile" />
        <div className="sheet-body grid g-2">
          <Field label="Full name" error={pErr.name}><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Mobile" optional error={pErr.phone}><input className="input" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <Field label="Email" hint="Contact the grievance cell to change your email."><input className="input" value={user!.email} disabled /></Field>
          <Field label="Preferred language">
            <Segmented value={p.preferredLang} onChange={(v) => setP({ ...p, preferredLang: v })} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: <span lang="hi">हिन्दी</span> }, { value: 'te', label: <span lang="te">తెలుగు</span> }]} />
          </Field>
        </div>
        <div className="sheet-foot">
          <span className="grow xs muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setP({ name: user!.name, phone: user!.phone, preferredLang: user!.preferredLang })}>Discard</Button>
          <Button type="submit" variant="primary" disabled={!dirty} loading={pBusy}>Save profile</Button>
        </div>
      </form>

      <section className="sheet">
        <SheetHead fig="02" title="Appearance" />
        <div className="sheet-body row between wrap gap-12">
          <div className="col gap-4">
            <span className="small" style={{ fontWeight: 600 }}>Theme</span>
            <span className="xs muted">Graphite (dark) is the default. Paper (light) is easier in bright daylight.</span>
          </div>
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'dark', label: <><Icon name="moon" size={13} /> Graphite</> }, { value: 'light', label: <><Icon name="sun" size={13} /> Paper</> }]} />
        </div>
      </section>

      <form className="sheet" onSubmit={changePw}>
        <SheetHead fig="03" title="Password" />
        <div className="sheet-body grid g-3">
          <Field label="Current password" error={pwErr.current}><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" error={pwErr.next} hint="8+ characters, letters and numbers."><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password" error={pwErr.confirm}><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div className="sheet-foot">
          <span className="grow xs muted">Changing your password signs out your other devices.</span>
          <Button type="submit" variant="primary" disabled={!pw.current || !pw.next} loading={pwBusy}>Update password</Button>
        </div>
      </form>

      <section className="sheet" style={{ borderColor: 'color-mix(in srgb, var(--oxide) 30%, transparent)' }}>
        <SheetHead fig="04" title="Sessions" />
        <div className="sheet-body row between wrap gap-12">
          <div className="col gap-4">
            <span className="small" style={{ fontWeight: 600 }}>Sign out everywhere</span>
            <span className="xs muted">Ends every active session, including this one. Use this if you signed in on a shared device.</span>
          </div>
          <Button variant="danger" icon="logout" onClick={() => setRevokeOpen(true)}>Sign out all devices</Button>
        </div>
      </section>
      <ConfirmDialog open={revokeOpen} onClose={() => setRevokeOpen(false)} onConfirm={revokeAll} danger title="Sign out of all devices?" body="You'll need to sign in again on every device, including this one." confirmLabel="Sign out everywhere" />
    </div>
  );
}
