import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Domain } from '../../lib/types';
import { Button, DomainTag, ErrorState, Field, PageHead, SkeletonRows, Switch } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

interface Dept { id: number; code: string; name: string; domain: Domain; description: string; headName: string; email: string; slaHours: number; active: number; officers: number; open: number }

export default function Departments() {
  const q = useQuery({ queryKey: ['departments'], queryFn: () => api.get<{ items: Dept[] }>('/admin/departments') });
  const [edit, setEdit] = useState<Dept | null>(null);
  const groups: Domain[] = ['education', 'healthcare', 'public_service'];
  return (
    <div className="col gap-20">
      <PageHead index="ADM · 04" eyebrow="FR14 · Routing targets" title={<>Departments</>} sub="Each category in the taxonomy is owned by exactly one department. Service levels here are the department's internal target; complaint deadlines follow priority (see System settings)." />
      {q.isLoading ? <div className="sheet"><SkeletonRows n={8} /></div> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : groups.map((g) => (
        <section key={g} className="col gap-12">
          <div className="divider-label"><DomainTag domain={g} /></div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {q.data!.items.filter((d) => d.domain === g).map((d) => (
              <article key={d.id} className="sheet reg" style={{ padding: 18, opacity: d.active ? 1 : 0.55 }}>
                <div className="row between">
                  <span className="tag tag-accent">{d.code}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(d)}>Edit</Button>
                </div>
                <h3 className="h3 mt-12">{d.name}</h3>
                <p className="xs muted mt-4" style={{ minHeight: 34 }}>{d.description}</p>
                <div className="row gap-20 mt-12">
                  <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 20 }}>{d.open}</span><span className="label" style={{ fontSize: 9 }}>Open</span></div>
                  <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 20 }}>{d.officers}</span><span className="label" style={{ fontSize: 9 }}>Officers</span></div>
                  <div className="col" style={{ gap: 0 }}><span className="num" style={{ fontSize: 20 }}>{d.slaHours}h</span><span className="label" style={{ fontSize: 9 }}>Target</span></div>
                </div>
                <div className="xs muted mt-12 row gap-6"><Icon name="user" size={12} />{d.headName || '—'}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {edit && <EditDept d={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditDept({ d, onClose }: { d: Dept; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ name: d.name, description: d.description, headName: d.headName, email: d.email, slaHours: d.slaHours, active: !!d.active });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.patch(`/admin/departments/${d.id}`, f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['taxonomy'] }); toast.push({ title: `${d.code} updated`, tone: 'success' }); onClose(); },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fields); toast.error(e); },
  });
  return (
    <Modal open onClose={onClose} eyebrow={d.code} title="Edit department" wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid g-2">
        <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Head of department"><input className="input" value={f.headName} onChange={(e) => setF({ ...f, headName: e.target.value })} /></Field>
        <Field label="Contact email" error={errors.email}><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Internal target (hours)" error={errors.slaHours}><input className="input" type="number" min={4} value={f.slaHours} onChange={(e) => setF({ ...f, slaHours: Number(e.target.value) })} /></Field>
        <div style={{ gridColumn: '1 / -1' }}><Field label="Description"><textarea className="textarea" style={{ minHeight: 70 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
        <div className="row gap-12" style={{ gridColumn: '1 / -1' }}>
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Accepting assignments" />
          <span className="small">Accepting new assignments</span>
          {!f.active && d.open > 0 && <span className="xs" style={{ color: 'var(--oxide)' }}>Reassign {d.open} open case(s) first.</span>}
        </div>
      </div>
    </Modal>
  );
}
