import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { detectScript, LANG_LABEL, LANG_NATIVE } from '../../lib/format';
import type { ComplaintSummary, Taxonomy } from '../../lib/types';
import { Button, Field, PageHead, SheetHead } from '../../components/ui';
import { FilePicker, STAGES } from '../../components/Case';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

const DRAFT_KEY = 'plb-draft-v1';
interface Draft { title: string; body: string; locationInput: string; districtInput: string; institutionInput: string; pincode: string; incidentDate: string }
const EMPTY: Draft = { title: '', body: '', locationInput: '', districtInput: '', institutionInput: '', pincode: '', incidentDate: '' };

function loadDraft(): Draft {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft>) };
  } catch {
    return EMPTY;
  }
}

const EXAMPLES = [
  { lang: 'te', title: 'మా కాలనీలో త్రాగునీరు రావడం లేదు', body: 'మా కాలనీలో గత మూడు రోజులుగా త్రాగునీరు రావడం లేదు. వృద్ధులు మరియు పిల్లలు చాలా ఇబ్బంది పడుతున్నారు. దయచేసి వెంటనే చర్య తీసుకోండి.' },
  { lang: 'hi', title: 'स्कूल में शिक्षक नहीं आते', body: 'हमारे गांव के सरकारी स्कूल में पिछले दो हफ्ते से शिक्षक नहीं आ रहे हैं। बच्चों की पढ़ाई का बहुत नुकसान हो रहा है। कृपया तुरंत कार्रवाई करें।' },
  { lang: 'en', title: 'Streetlights out and exposed wire near bus stop', body: 'Eight streetlights on the main road near the bus stop have not worked for ten days. There is an exposed live wire hanging from one pole at child height. Women and students walk here after dark.' },
];

export default function NewComplaint() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const tax = useQuery({ queryKey: ['taxonomy'], queryFn: () => api.get<Taxonomy>('/meta/taxonomy'), staleTime: Infinity });
  const [d, setD] = useState<Draft>(loadDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (d.title || d.body) { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); setSaved(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })); }
      } catch { /* storage unavailable */ }
    }, 600);
    return () => window.clearTimeout(t);
  }, [d]);

  const lang = useMemo(() => detectScript(`${d.title} ${d.body}`), [d.title, d.body]);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (d.title.trim().length < 6) e.title = 'Give your complaint a short title (at least 6 characters).';
    if (d.body.trim().length < 30) e.body = `Describe the issue in a little more detail (${30 - d.body.trim().length} more characters).`;
    if (d.pincode && !/^[1-8]\d{5}$/.test(d.pincode)) e.pincode = 'Enter a valid 6-digit PIN code.';
    if (d.incidentDate && Date.parse(d.incidentDate) > Date.now()) e.incidentDate = 'Incident date cannot be in the future.';
    if (!consent) e.consent = 'Please confirm the information is accurate.';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    const fd = new FormData();
    Object.entries(d).forEach(([k, v]) => fd.append(k, v));
    fd.append('consent', 'true');
    files.forEach((f) => fd.append('files', f));
    try {
      const r = await api.post<{ complaint: ComplaintSummary }>('/complaints', fd);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      navigate(`/app/c/${r.complaint.id}?fresh=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) toast.error(err);
      } else toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const bodyLen = d.body.length;

  return (
    <div>
      <PageHead
        index="FORM · G-1"
        eyebrow="New grievance"
        title={<>What went <em className="serif-i accent">wrong?</em></>}
        sub="Describe it the way you would to a neighbour — in English, Hindi or Telugu. Specifics help most: where, since when, who is affected."
        actions={saved ? <span className="label row gap-6"><Icon name="check" size={12} /> Draft saved {saved}</span> : undefined}
      />
      <form className="composer" onSubmit={submit} noValidate>
        <div className="col gap-20">
          <section className="sheet reg">
            <SheetHead fig="01" title="The complaint" right={lang && <span className="lang-live">DETECTED <b lang={lang}>{LANG_NATIVE[lang]}</b>{lang !== 'en' && <span>· auto-translated</span>}</span>} />
            <div className="sheet-body col gap-16">
              <Field label="Title" error={errors.title} counter={<span className="counter">{d.title.length}/140</span>}>
                <input className={`input${lang && lang !== 'en' ? ` lang-${lang}` : ''}`} maxLength={140} value={d.title} onChange={set('title')} placeholder="e.g. No drinking water in our colony for 4 days" />
              </Field>
              <Field
                label="Describe the issue"
                error={errors.body}
                hint="Mention how long it has been happening and who is affected (children, elderly, patients…)."
                counter={<span className={`counter${bodyLen > 4500 ? ' warn' : ''}`}>{bodyLen}/5000</span>}
              >
                <textarea className={`textarea${lang && lang !== 'en' ? ` lang-${lang}` : ''}`} style={{ minHeight: 190 }} maxLength={5000} value={d.body} onChange={set('body')} placeholder="What happened? Where? Since when?" />
              </Field>
              {!d.title && !d.body && (
                <div className="row wrap gap-8">
                  <span className="label">Try an example</span>
                  {EXAMPLES.map((x) => (
                    <button key={x.lang} type="button" className="tag" style={{ cursor: 'pointer' }} onClick={() => setD((v) => ({ ...v, title: x.title, body: x.body }))}>
                      {LANG_LABEL[x.lang]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="sheet reg">
            <SheetHead fig="02" title="Where & when" />
            <div className="sheet-body grid g-2" style={{ gap: 16 }}>
              <Field label="Institution / college / hospital / office" optional hint="Enter the exact institution name if the complaint concerns a specific place.">
                <input className="input" value={d.institutionInput} onChange={set('institutionInput')} placeholder="e.g. Government Degree College, Secunderabad" maxLength={160} />
              </Field>
              <Field label="Locality / landmark" optional>
                <input className="input" value={d.locationInput} onChange={set('locationInput')} placeholder="e.g. KPHB Colony Phase 3" maxLength={160} />
              </Field>
              <Field label="District" optional error={errors.districtInput}>
                <select className="select" value={d.districtInput} onChange={set('districtInput')}>
                  <option value="">Detect from description</option>
                  {Object.entries(groupBy(tax.data?.districts ?? [], (x) => x.state)).map(([state, ds]) => (
                    <optgroup key={state} label={state}>{ds.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</optgroup>
                  ))}
                </select>
              </Field>
              <Field label="PIN code" optional error={errors.pincode}>
                <input className="input mono" inputMode="numeric" maxLength={6} value={d.pincode} onChange={(e) => setD((x) => ({ ...x, pincode: e.target.value.replace(/\D/g, '') }))} placeholder="500072" />
              </Field>
              <Field label="When did it start?" optional error={errors.incidentDate}>
                <input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={d.incidentDate} onChange={set('incidentDate')} />
              </Field>
            </div>
          </section>

          <section className="sheet reg">
            <SheetHead fig="03" title="Evidence" right={<span className="label">FR4</span>} />
            <div className="sheet-body">
              <FilePicker files={files} onChange={setFiles} />
            </div>
          </section>

          <div className="col gap-12">
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={errors.consent ? true : undefined} />
              <span>I confirm this information is accurate to the best of my knowledge, and I agree that it may be shared with the officials responsible for resolving it.</span>
            </label>
            {errors.consent && <span className="field-error">{errors.consent}</span>}
            <div className="row gap-12 wrap">
              <Button variant="primary" size="lg" type="submit" loading={busy} iconRight="arrowRight">Submit complaint</Button>
              <Link to="/app" className="btn btn-ghost btn-lg">Cancel</Link>
              {(d.title || d.body) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setD(EMPTY); setFiles([]); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setSaved(null); }}>
                  Clear draft
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="composer-aside col gap-16">
          <section className="sheet">
            <SheetHead title="What happens next" icon="route" />
            <div className="sheet-body col gap-12">
              <p className="small ink2" style={{ lineHeight: 1.6 }}>The moment you submit, an automated analysis runs through {STAGES.length} steps. You can watch each one complete in real time.</p>
              <ol className="col" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 0 }}>
                {STAGES.map((s, i) => (
                  <li key={s.key} className="row gap-10 small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-1)' }}>
                    <span className="mono dim xs" style={{ width: 18 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="grow ink2">{s.label}</span>
                    <span className="label" style={{ fontSize: 9 }}>{s.fr}</span>
                  </li>
                ))}
              </ol>
              <div className="callout info"><Icon name="shield" /><span>An official verifies the analysis before it reaches a department. You are notified at every step.</span></div>
            </div>
          </section>
          <section className="sheet sunken" style={{ padding: 16 }}>
            <span className="label">Privacy</span>
            <p className="xs muted mt-8" style={{ lineHeight: 1.6 }}>Phone numbers, emails and ID numbers in your text are masked before analysis. Only the officials handling your case can see your contact details.</p>
          </section>
        </aside>
      </form>
    </div>
  );
}

function groupBy<T>(xs: T[], f: (x: T) => string) {
  return xs.reduce<Record<string, T[]>>((a, x) => ((a[f(x)] ??= []).push(x), a), {});
}
