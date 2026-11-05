const B = `http://localhost:${process.env.PORT || 4000}/api`;
function client() {
  let cookie = '';
  return async (method, path, body, isForm) => {
    const headers = { cookie };
    let payload;
    if (isForm) payload = body; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(B + path, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
    if (!r.ok) console.log('  !', method, path, r.status, JSON.stringify(j).slice(0, 200));
    return { s: r.status, j };
  };
}
const ok = (c, m) => console.log(c ? '  ✓' : '  ✗', m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cit = client(), adm = client(), off = client();
const email = `t${Date.now()}@example.in`;
let r = await cit('POST', '/auth/register', { name: 'Test Citizen', email, password: 'short' });
ok(r.s === 422 && r.j.fields?.password, 'register validation rejects weak password');
r = await cit('POST', '/auth/register', { name: 'Test Citizen', email, password: 'Secret123', preferredLang: 'te' });
ok(r.s === 201, 'register citizen');
r = await cit('POST', '/auth/staff/login', { email, password: 'Secret123' });
ok(r.s === 403, 'citizen blocked from staff portal (FR2)');

const fd = new FormData();
fd.append('title', 'మా కాలనీలో త్రాగునీరు రావడం లేదు');
fd.append('body', 'మా కాలనీలో గత ఐదు రోజులుగా త్రాగునీరు రావడం లేదు. చాలా ఇబ్బంది పడుతున్నాం. పిల్లలు మరియు వృద్ధులు బాధపడుతున్నారు. Kukatpally KPHB colony. Call me 9848012345');
fd.append('locationInput', 'KPHB Colony'); fd.append('districtInput', ''); fd.append('consent', 'true');
fd.append('files', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'photo.png');
r = await cit('POST', '/complaints', fd, true);
ok(r.s === 201, `complaint filed ${r.j.complaint?.ref}`);
const id = r.j.complaint.id;
for (let i = 0; i < 180; i++) { r = await cit('GET', `/complaints/${id}`); if (r.j.complaint.status === 'awaiting_verification') break; await sleep(500); }
const c = r.j.complaint;
ok(c.status === 'awaiting_verification', `pipeline done → ${c.status}`);
ok(c.language === 'te', `language detected: ${c.language}`);
ok(c.ai && c.ai.trace?.length === 11, `citizen sees ${c.ai?.trace?.length} stage trace`);
ok(c.ai.classification === undefined, 'citizen does not see internal AI dossier');
ok(c.attachments.length === 1, 'attachment stored');

r = await adm('POST', '/auth/staff/login', { email: 'admin@plumbline.gov.in', password: 'Admin@123' });
ok(r.s === 200, 'admin login');
r = await adm('GET', `/complaints/${id}`);
const ai = r.j.complaint.ai;
console.log('    AI:', ai.classification.domain, ai.classification.category, 'conf', ai.confidence.score, 'sev', ai.severity.level, ai.priority.priority, 'dist', ai.location.district, 'dept', ai.routing.departmentCode);
console.log('    EN:', r.j.complaint.bodyEnglish.slice(0, 140));
console.log('    PII masked:', ai.preprocess.stats.piiMasked, '· dups', ai.similarity.duplicates.map(d => d.ref + ' ' + d.similarity), '· history', ai.similarity.history.length);
ok(ai.classification.category === 'water_supply', 'classified as water supply');
ok(ai.preprocess.stats.piiMasked >= 1, 'phone number masked as PII');

r = await adm('GET', '/meta/taxonomy');
const wsb = r.j.departments.find((d) => d.code === 'WSB');
r = await adm('POST', `/complaints/${id}/verify`, { domain: 'public_service', category: 'water_supply', severity: 4, priority: 'P2', departmentId: wsb.id, district: 'Medchal–Malkajgiri', locationText: 'KPHB Colony', note: 'district set by reviewer', citizenMessage: '' });
ok(r.s === 200 && r.j.complaint.status === 'assigned', `verified & assigned; corrections: ${JSON.stringify(r.j.corrections)}`);

r = await off('POST', '/auth/staff/login', { email: 'wsb.officer@plumbline.gov.in', password: 'Officer@123' });
ok(r.s === 200, 'officer login');
r = await off('GET', '/complaints?pageSize=50');
ok(r.j.items.some((x) => x.id === id), 'officer sees assigned complaint in dept registry');
const mad = client(); await mad('POST', '/auth/staff/login', { email: 'mad.officer@plumbline.gov.in', password: 'Officer@123' });
r = await mad('GET', `/complaints/${id}`);
ok(r.s === 404, 'other department officer cannot see it');
r = await off('POST', `/complaints/${id}/status`, { status: 'resolved', resolutionNote: 'short' });
ok(r.s === 422, 'resolve requires a real resolution note');
r = await off('POST', `/complaints/${id}/status`, { status: 'in_progress' });
ok(r.j.complaint?.status === 'in_progress', 'work started');
r = await off('POST', `/complaints/${id}/comments`, { message: 'Line inspector dispatched.', visibility: 'public' });
r = await off('POST', `/complaints/${id}/comments`, { message: 'Valve team short-staffed', visibility: 'internal' });
r = await cit('GET', `/complaints/${id}`);
ok(!r.j.complaint.events.some((e) => e.message.includes('short-staffed')), 'internal note hidden from citizen');
r = await off('POST', `/complaints/${id}/status`, { status: 'resolved', resolutionNote: 'Valve replaced at reservoir outlet and supply restored on schedule.' });
ok(r.j.complaint?.status === 'resolved', 'resolved');
r = await cit('POST', `/complaints/${id}/feedback`, { rating: 2, satisfied: false, comment: 'Water came for one day only', reopen: true });
ok(r.j.complaint?.status === 'reopened' && r.j.complaint.escalationLevel >= 1, `reopened + escalated (L${r.j.complaint?.escalationLevel})`);
r = await cit('GET', '/notifications');
ok(r.j.items.length >= 3, `citizen notifications: ${r.j.items.length}`);
r = await adm('GET', '/admin/overview'); ok(r.s === 200 && r.j.kpis, `overview ok · open ${r.j.kpis.open} · AI acc ${r.j.kpis.aiAccuracy}%`);
r = await adm('GET', '/admin/insights'); ok(r.s === 200, `insights ok · corrections ${r.j.corrections.length} · fields ${r.j.fieldStats.map(f=>f.field+':'+f.accuracy).join(' ')}`);
r = await adm('POST', '/admin/model/retrain'); ok(r.s === 200, `retrain → acc ${r.j.accuracy}`);
r = await off('GET', '/admin/insights'); ok(r.s === 403, 'officer cannot access insights');
r = await cit('GET', '/admin/overview'); ok(r.s === 403, 'citizen cannot access overview');
r = await adm('GET', '/complaints/export.csv'); ok(typeof r.j === 'string' && r.j.includes('ref,created_at'), 'CSV export');
