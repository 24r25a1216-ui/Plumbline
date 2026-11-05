import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError, qs } from '../../lib/api';
import { useSession } from '../../lib/session';
import { ago } from '../../lib/format';
import type { Taxonomy } from '../../lib/types';
import { Avatar, Button, EmptyState, ErrorState, Field, PageHead, Segmented, SkeletonRows } from '../../components/ui';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

interface Row { id: number; name: string; email: string; role: 'citizen' | 'officer' | 'admin'; phone: string; status: 'active' | 'suspended'; lastLoginAt: string | null; createdAt: string; departmentId: number | null; departmentCode: string | null; complaints: number }

export default function Users() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [suspend, setSuspend] = useState<Row | null>(null);
  const [reset, setReset] = useState<Row | null>(null);
  const [secret, setSecret] = useState<{ email: string; pw: string } | null>(null);
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.get<Taxonomy>('/meta/taxonomy'), staleTime: Infinity });
  const q = useQuery({ queryKey: ['users', role, search], queryFn: () => api.get<{ items: Row[] }>(`/admin/users${qs({ role, q: search })}`), placeholderData: keepPreviousData });
  const counts = useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<{ items: Row[] }>('/admin/users') });
  const c = (r: string) => counts.data?.items.filter((x) => x.role === r).length;

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.push({ title: 'Access updated', tone: 'success' }); setEdit(null); setSuspend(null); },
    onError: (e) => toast.error(e),
  });
  const resetPw = useMutation({
    mutationFn: (r: Row) => api.post<{ temporaryPassword: string }>(`/admin/users/${r.id}/reset-password`),
    onSuccess: (res, r) => { setReset(null); setSecret({ email: r.email, pw: res.temporaryPassword }); },
    onError: (e) => toast.error(e),
  });

  return (
    <div className="col gap-20">
      <PageHead
        index="ADM · 05"
        eyebrow="FR1 · FR2 — Role-based access"
        title={<>People & <em className="serif-i accent">access</em></>}
        actions={<Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Add official</Button>}
      />
      <section className="sheet">
        <div className="row wrap gap-12" style={{ padding: 14, borderBottom: '1px solid var(--line-1)' }}>
          <Segmented value={role} onChange={setRole} options={[{ value: '', label: 'Everyone', count: counts.data?.items.length }, { value: 'admin', label: 'Admins', count: c('admin') }, { value: 'officer', label: 'Officers', count: c('officer') }, { value: 'citizen', label: 'Citizens', count: c('citizen') }]} />
          <span className="grow" />
          <div className="input-wrap" style={{ width: 260 }}><Icon name="search" /><input className="input input-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" aria-label="Search people" /></div>
        </div>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState title="No one matches" body="Try a different name or role." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Role</th><th className="hide-sm">Department</th><th className="hide-sm">Complaints</th><th>Status</th><th className="hide-sm">Last sign-in</th><th /></tr></thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === 'suspended' ? 0.55 : 1 }}>
                    <td><div className="row gap-10"><Avatar name={r.name} sm tone={r.role === 'admin' ? 'var(--ochre)' : r.role === 'officer' ? 'var(--verdigris)' : undefined} /><div className="col" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{r.name}{r.id === user!.id && <span className="label"> · you</span>}</span><span className="xs muted">{r.email}</span></div></div></td>
                    <td><span className="tag">{r.role.toUpperCase()}</span></td>
                    <td className="hide-sm mono xs">{r.departmentCode ?? <span className="dim">—</span>}</td>
                    <td className="hide-sm num">{r.complaints || <span className="dim">0</span>}</td>
                    <td><span className="chip" style={{ ['--c' as string]: r.status === 'active' ? 'var(--verdigris)' : 'var(--oxide)' }}><span className="dot" />{r.status}</span></td>
                    <td className="hide-sm xs muted">{r.lastLoginAt ? ago(r.lastLoginAt) : 'Never'}</td>
                    <td>
                      <div className="row gap-4 end">
                        {r.role !== 'citizen' && <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Edit</Button>}
                        <Button size="sm" variant="ghost" icon="key" onClick={() => setReset(r)} aria-label="Reset password" />
                        {r.id !== user!.id && (r.status === 'active'
                          ? <Button size="sm" variant="ghost" onClick={() => setSuspend(r)} style={{ color: 'var(--oxide)' }}>Suspend</Button>
                          : <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, body: { status: 'active' } })}>Reactivate</Button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} tax={tax.data} onCreated={(email, pw) => { setCreateOpen(false); setSecret({ email, pw }); qc.invalidateQueries({ queryKey: ['users'] }); }} />
      {edit && <EditDialog row={edit} tax={tax.data} onClose={() => setEdit(null)} onSave={(body) => patch.mutate({ id: edit.id, body })} busy={patch.isPending} />}
      <ConfirmDialog open={!!suspend} onClose={() => setSuspend(null)} danger title={`Suspend ${suspend?.name}?`} body="They are signed out immediately and cannot sign in until reactivated. Their records are kept." reason reasonMin={5} reasonLabel="Reason (recorded in the audit trail)" typeToConfirm="SUSPEND" confirmLabel="Suspend account" busy={patch.isPending} onConfirm={(reason) => { if (suspend) patch.mutate({ id: suspend.id, body: { status: 'suspended', reason } }); }} />
      <ConfirmDialog open={!!reset} onClose={() => setReset(null)} title={`Reset password for ${reset?.name}?`} body="A one-time temporary password is generated and all their sessions are ended." confirmLabel="Generate password" busy={resetPw.isPending} onConfirm={() => { if (reset) resetPw.mutate(reset); }} />
      <Modal open={!!secret} onClose={() => setSecret(null)} eyebrow="Shown once" title="Temporary password" footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
        <div className="col gap-12">
          <p className="small ink2">Share this securely with <b>{secret?.email}</b>. It won't be shown again — ask them to change it after signing in.</p>
          <div className="row gap-8"><code className="input mono" style={{ display: 'flex', alignItems: 'center', fontSize: 16, color: 'var(--lichen)' }}>{secret?.pw}</code><Button icon="copy" onClick={() => { navigator.clipboard?.writeText(secret?.pw ?? ''); toast.push({ title: 'Copied', tone: 'success' }); }}>Copy</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function CreateDialog({ open, onClose, tax, onCreated }: { open: boolean; onClose: () => void; tax?: Taxonomy; onCreated: (email: string, pw: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'officer' as 'officer' | 'admin', departmentId: 0 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.post<{ temporaryPassword: string }>('/admin/users', { ...f, departmentId: f.role === 'officer' ? f.departmentId || null : null }),
    onSuccess: (r) => { onCreated(f.email, r.temporaryPassword); setF({ name: '', email: '', role: 'officer', departmentId: 0 }); setErrors({}); },
    onError: (e) => e instanceof ApiError && setErrors({ ...e.fields, _: Object.keys(e.fields).length ? '' : e.message }),
  });
  return (
    <Modal open={open} onClose={onClose} eyebrow="New staff account" title="Add an official" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Create account</Button></>}>
      <div className="col gap-16">
        {errors._ && <div className="callout danger"><Icon name="alert" /><span>{errors._}</span></div>}
        <Field label="Full name" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Official email" error={errors.email}><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@plumbline.gov.in" /></Field>
        <Field label="Role"><Segmented value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: 'officer', label: 'Department officer' }, { value: 'admin', label: 'Grievance cell admin' }]} /></Field>
        {f.role === 'officer' && (
          <Field label="Department" error={errors.departmentId}>
            <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: Number(e.target.value) })}>
              <option value={0}>Choose…</option>
              {tax?.departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function EditDialog({ row, tax, onClose, onSave, busy }: { row: Row; tax?: Taxonomy; onClose: () => void; onSave: (b: Record<string, unknown>) => void; busy: boolean }) {
  const [role, setRole] = useState(row.role);
  const [dept, setDept] = useState(row.departmentId ?? 0);
  return (
    <Modal open onClose={onClose} eyebrow="Edit access" title={row.name} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={role === 'officer' && !dept} onClick={() => onSave({ role, departmentId: role === 'officer' ? dept : null })}>Save</Button></>}>
      <div className="col gap-16">
        <Field label="Role"><Segmented value={role} onChange={setRole} options={[{ value: 'officer', label: 'Officer' }, { value: 'admin', label: 'Admin' }, { value: 'citizen', label: 'Citizen' }]} /></Field>
        {role === 'officer' && (
          <Field label="Department">
            <select className="select" value={dept} onChange={(e) => setDept(Number(e.target.value))}>
              <option value={0}>Choose…</option>
              {tax?.departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </Field>
        )}
        {role !== row.role && <div className="callout warn"><Icon name="alert" /><span>Changing role signs this person out of all sessions.</span></div>}
      </div>
    </Modal>
  );
}
