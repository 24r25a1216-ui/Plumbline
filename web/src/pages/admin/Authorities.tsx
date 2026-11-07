import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { Button, ErrorState, Field, PageHead, SkeletonRows } from '../../components/ui';
import { useToast } from '../../components/Toast';

interface Department { id: number; code: string; name: string }
interface Authority {
  id: number; departmentId: number; departmentCode: string; departmentName: string;
  district: string; institution: string; level: number; designation: string; authorityName: string;
  email: string; sourceUrl: string; verified: number; active: number;
}
const blank = { departmentId: 0, district: '', institution: '', level: 1, designation: '', authorityName: '', email: '', sourceUrl: '', verified: false, active: true };

export default function Authorities() {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.get<{ items: Department[] }>('/admin/departments') });
  const authorities = useQuery({ queryKey: ['authorities'], queryFn: () => api.get<{ items: Authority[] }>('/admin/authorities') });
  const deliveries = useQuery({ queryKey: ['email-deliveries'], queryFn: () => api.get<{ items: { id: number; complaintId: number | null; recipient: string; recipientType: string; subject: string; status: string; error: string; createdAt: string }[] }>('/admin/email-deliveries') });
  const save = useMutation({
    mutationFn: () => editingId ? api.patch(`/admin/authorities/${editingId}`, form) : api.post('/admin/authorities', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['authorities'] }); toast.push({ title: editingId ? 'Authority email updated' : 'Authority email saved', tone: 'success' }); setForm({ ...blank, departmentId: form.departmentId }); setEditingId(null); setErrors({}); },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fields); toast.error(e); },
  });
  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/authorities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['authorities'] }); toast.push({ title: 'Authority deactivated', tone: 'success' }); },
    onError: (e) => toast.error(e),
  });
  const list = useMemo(() => authorities.data?.items ?? [], [authorities.data]);

  return <div className="col gap-20">
    <PageHead index="ADM · 05" eyebrow="Official public contact directory" title="Authority email routing" sub="Add public email addresses from official department or institution websites. Only verified active addresses receive complaint emails." />
    <section className="sheet col gap-12" style={{ padding: 20 }}>
      <div><span className="tag tag-accent">NEW ROUTING TARGET</span><h2 className="h3 mt-8">{editingId ? 'Edit authority email' : 'Add an authority email'}</h2><p className="small muted mt-4">Use one record for each department, district and escalation level. Level 1 is the first/local authority.</p></div>
      {departments.isLoading ? <SkeletonRows n={2} /> : departments.isError ? <ErrorState error={departments.error} retry={() => departments.refetch()} /> : <>
        <div className="grid g-2">
          <Field label="Department" error={errors.departmentId}><select className="input" value={form.departmentId || ''} onChange={e => setForm({ ...form, departmentId: Number(e.target.value) })}><option value="">Select department</option>{departments.data!.items.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</select></Field>
          <Field label="District (leave blank for state / all-district authority)" error={errors.district}><input className="input" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="e.g. Hyderabad" /></Field>
          <Field label="Institution (leave blank for any institution)" error={errors.institution}><input className="input" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} placeholder="e.g. Government Degree College" /></Field>
          <Field label="Escalation level" error={errors.level}><input className="input" type="number" min="1" max="50" value={form.level} onChange={e => setForm({ ...form, level: Number(e.target.value) })} /></Field>
          <Field label="Designation" error={errors.designation}><input className="input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. District Education Officer" /></Field>
          <Field label="Authority / institution name" error={errors.authorityName}><input className="input" value={form.authorityName} onChange={e => setForm({ ...form, authorityName: e.target.value })} /></Field>
          <Field label="Official public email" error={errors.email}><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="office@department.gov.in" /></Field>
          <div style={{ gridColumn: '1 / -1' }}><Field label="Official source URL (where this email is published)" error={errors.sourceUrl}><input className="input" type="url" value={form.sourceUrl} onChange={e => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://official-government-website.gov.in/contact" /></Field></div>
        </div>
        <label className="row gap-8 small"><input type="checkbox" checked={form.verified} onChange={e => setForm({ ...form, verified: e.target.checked })} /> I checked this email on the official source above.</label>
        <div className="row gap-8"><Button variant="primary" loading={save.isPending} disabled={!form.departmentId || !form.designation || !form.email || !form.sourceUrl} onClick={() => save.mutate()}>{editingId ? 'Update authority email' : 'Save authority email'}</Button>{editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setForm(blank); setErrors({}); }}>Cancel edit</Button>}</div>
      </>}
    </section>
    <section className="sheet col gap-12" style={{ padding: 20 }}>
      <div className="row between"><div><h2 className="h3">Configured authorities</h2><p className="small muted">Email forwarding only uses active, verified records.</p></div><span className="tag">{list.length} records</span></div>
      {authorities.isLoading ? <SkeletonRows n={5} /> : authorities.isError ? <ErrorState error={authorities.error} retry={() => authorities.refetch()} /> : list.length === 0 ? <p className="small muted">No authority email addresses configured yet.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Department / district</th><th>Level</th><th>Authority</th><th>Public email</th><th>Source / status</th><th></th></tr></thead><tbody>{list.map(a => <tr key={a.id} style={{ opacity: a.active ? 1 : .5 }}><td><b>{a.departmentCode}</b><div className="xs muted">{a.district || 'All districts / state'}{a.institution ? ` · ${a.institution}` : ' · All institutions'}</div></td><td>L{a.level}</td><td>{a.authorityName || a.designation}<div className="xs muted">{a.designation}</div></td><td>{a.email}</td><td><a href={a.sourceUrl} target="_blank" rel="noreferrer" className="xs">Official source ↗</a><div className="xs muted">{a.verified ? 'Verified' : 'Not verified'} · {a.active ? 'Active' : 'Inactive'}</div></td><td><div className="row gap-4"><Button size="sm" variant="ghost" onClick={() => { setEditingId(a.id); setForm({ departmentId: a.departmentId, district: a.district, institution: a.institution, level: a.level, designation: a.designation, authorityName: a.authorityName, email: a.email, sourceUrl: a.sourceUrl, verified: !!a.verified, active: !!a.active }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button>{a.active && <Button size="sm" variant="ghost" onClick={() => deactivate.mutate(a.id)}>Deactivate</Button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <section className="sheet col gap-12" style={{ padding: 20 }}>
      <div><h2 className="h3">Recent email delivery log</h2><p className="small muted">Accepted means Resend accepted the request; it does not guarantee inbox delivery.</p></div>
      {deliveries.isLoading ? <SkeletonRows n={3} /> : deliveries.isError ? <ErrorState error={deliveries.error} retry={() => deliveries.refetch()} /> : (deliveries.data?.items ?? []).length === 0 ? <p className="small muted">No email attempts recorded yet.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>Type</th><th>Recipient</th><th>Subject</th><th>Status</th></tr></thead><tbody>{deliveries.data!.items.map(x => <tr key={x.id}><td className="xs">{new Date(x.createdAt).toLocaleString()}</td><td>{x.recipientType}</td><td>{x.recipient}</td><td>{x.subject}<div className="xs muted">{x.error}</div></td><td><span className="tag" style={{ color: x.status === 'accepted' ? 'var(--lichen)' : 'var(--oxide)' }}>{x.status}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
