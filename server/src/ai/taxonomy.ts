/**
 * Domain knowledge used by both engines: the classification taxonomy,
 * department routing table, severity priors, resolution playbooks and the
 * location gazetteer (Telangana / Andhra Pradesh focus, plus metros).
 */

export type DomainKey = 'education' | 'healthcare' | 'public_service';

export const DOMAINS: { key: DomainKey; label: string; blurb: string }[] = [
  { key: 'education', label: 'Education', blurb: 'Schools, colleges, examinations, scholarships and student welfare.' },
  { key: 'healthcare', label: 'Healthcare', blurb: 'Hospitals, clinics, medicines, emergency care and health schemes.' },
  { key: 'public_service', label: 'Public Service', blurb: 'Water, sanitation, roads, power, transport, rations and civic documents.' },
];

export interface DepartmentSeed {
  code: string;
  name: string;
  domain: DomainKey;
  description: string;
  head: string;
  sla: number;
}

export const DEPARTMENTS: DepartmentSeed[] = [
  { code: 'DSE', name: 'Directorate of School Education', domain: 'education', description: 'Government & aided schools, teachers, infrastructure, mid-day meals.', head: 'Director, School Education', sla: 120 },
  { code: 'HED', name: 'Higher Education & University Affairs', domain: 'education', description: 'Colleges, universities, admissions and examinations.', head: 'Commissioner, Collegiate Education', sla: 168 },
  { code: 'SWC', name: 'Scholarship & Fee Reimbursement Cell', domain: 'education', description: 'Post-matric scholarships, fee reimbursement, stipends.', head: 'Joint Director, Welfare', sla: 168 },
  { code: 'DPH', name: 'Public Health & Family Welfare', domain: 'healthcare', description: 'PHCs, CHCs, sanitation-linked disease control, outbreaks.', head: 'Director of Public Health', sla: 72 },
  { code: 'DME', name: 'Hospital Services (Medical Education)', domain: 'healthcare', description: 'Government teaching & district hospitals, staff conduct, wards.', head: 'Director of Medical Education', sla: 72 },
  { code: 'DCA', name: 'Drug Control Administration', domain: 'healthcare', description: 'Medicine availability, pharmacies, spurious drugs, pricing.', head: 'Director General, Drug Control', sla: 96 },
  { code: 'HIS', name: 'Health Insurance Scheme Trust', domain: 'healthcare', description: 'Cashless treatment, empanelled hospitals, claim disputes.', head: 'CEO, Health Insurance Trust', sla: 120 },
  { code: 'EMS', name: '108 Emergency Medical Services', domain: 'healthcare', description: 'Ambulance dispatch and emergency response.', head: 'State Head, EMRI', sla: 24 },
  { code: 'WSB', name: 'Water Supply & Sewerage Board', domain: 'public_service', description: 'Drinking water supply, quality, sewer lines and overflows.', head: 'Managing Director, Water Board', sla: 48 },
  { code: 'MAD', name: 'Municipal Administration', domain: 'public_service', description: 'Garbage, sanitation, roads, potholes, stray animals, drains.', head: 'Commissioner, Municipal Administration', sla: 72 },
  { code: 'PDC', name: 'Power Distribution Company', domain: 'public_service', description: 'Power cuts, streetlights, transformers, billing.', head: 'Chief Engineer, Operations', sla: 48 },
  { code: 'RTC', name: 'Road Transport Corporation', domain: 'public_service', description: 'Bus services, routes, staff conduct, passes.', head: 'Managing Director, RTC', sla: 120 },
  { code: 'CSD', name: 'Civil Supplies Department', domain: 'public_service', description: 'Ration cards, fair price shops, PDS distribution.', head: 'Commissioner, Civil Supplies', sla: 120 },
  { code: 'REV', name: 'Revenue Department (Meeseva)', domain: 'public_service', description: 'Certificates, land records, citizen services delivery.', head: 'Chief Commissioner, Land Administration', sla: 168 },
  { code: 'ACB', name: 'Vigilance & Anti-Corruption Bureau', domain: 'public_service', description: 'Bribery, misconduct and corruption by public servants.', head: 'Director General, ACB', sla: 96 },
];

export interface CategoryDef {
  key: string;
  domain: DomainKey;
  label: string;
  description: string;
  dept: string;
  baseSeverity: 1 | 2 | 3 | 4 | 5;
  keywords: string[];
  playbook: string[];
}

export const CATEGORIES: CategoryDef[] = [
  // ── Education ─────────────────────────────────────────────
  {
    key: 'teacher_conduct', domain: 'education', label: 'Teacher Absenteeism & Conduct', dept: 'DSE', baseSeverity: 3,
    description: 'Teachers absent, late, untrained, abusive or engaging in misconduct.',
    keywords: ['teacher', 'teachers', 'absent', 'absenteeism', 'headmaster', 'principal', 'not teaching', 'class not held', 'punish', 'beat', 'corporal', 'faculty', 'lecturer absent', 'शिक्षक', 'अध्यापक', 'मास्टर', 'ఉపాధ్యాయులు', 'ఉపాధ్యాయుడు', 'టీచర్', 'teacher ledu', 'master nahi'],
    playbook: ['Verify attendance registers and biometric logs for the past 30 days', 'Issue show-cause notice to the staff member through the Mandal Education Officer', 'Arrange substitute / deputation teacher within 72 hours', 'Schedule surprise inspection and share outcome with complainant'],
  },
  {
    key: 'school_infrastructure', domain: 'education', label: 'School Infrastructure & Facilities', dept: 'DSE', baseSeverity: 3,
    description: 'Toilets, drinking water, classrooms, roofs, furniture, labs, compound walls in educational institutions.',
    keywords: ['classroom', 'toilet', 'toilets', 'roof', 'leaking', 'benches', 'building', 'compound wall', 'school building', 'lab', 'library', 'fan', 'collapsed', 'cracks', 'हॉस्टल', 'hostel', 'स्कूल', 'విద్యాలయం', 'పాఠశాల', 'పాఠశాలలో', 'బడి'],
    playbook: ['Engineering wing to inspect structural safety within 48 hours', 'Shift classes from unsafe rooms immediately', 'Raise works estimate under school infrastructure grant', 'Publish completion photos to the complainant'],
  },
  {
    key: 'fees_irregularity', domain: 'education', label: 'Fees & Financial Irregularities', dept: 'HED', baseSeverity: 3,
    description: 'Excess fees, capitation, withheld certificates for fees, refund issues.',
    keywords: ['fee', 'fees', 'capitation', 'donation', 'refund', 'excess fee', 'certificates withheld', 'tc not given', 'overcharged', 'tuition', 'फीस', 'ఫీజు', 'ఫీజులు'],
    playbook: ['Request fee structure approved by the Fee Regulatory Committee', 'Direct institution to return original certificates within 7 days', 'Order refund of excess collection with written confirmation', 'Flag institution for audit if pattern repeats'],
  },
  {
    key: 'scholarship', domain: 'education', label: 'Scholarships & Fee Reimbursement', dept: 'SWC', baseSeverity: 2,
    description: 'Delayed or rejected scholarships, stipends and fee reimbursement.',
    keywords: ['scholarship', 'stipend', 'fee reimbursement', 'epass', 'e-pass', 'not credited', 'pending application', 'post matric', 'छात्रवृत्ति', 'स्कॉलरशिप', 'స్కాలర్‌షిప్', 'ఉపకార వేతనం', 'scholarship raledu'],
    playbook: ['Check application status on the scholarship portal against Aadhaar-seeded account', 'Resolve bank / Aadhaar seeding mismatch with the student', 'Push sanctioned amount in the next disbursement batch', 'Notify student with transaction reference'],
  },
  {
    key: 'examinations', domain: 'education', label: 'Examinations & Results', dept: 'HED', baseSeverity: 3,
    description: 'Results delays, revaluation, hall tickets, paper leaks, malpractice.',
    keywords: ['exam', 'exams', 'examination', 'result', 'results', 'hall ticket', 'revaluation', 'marks', 'memo', 'paper leak', 'malpractice', 'grade', 'परीक्षा', 'रिजल्ट', 'పరీక్ష', 'ఫలితాలు'],
    playbook: ['Verify records with the examination branch', 'Expedite revaluation / correction and issue revised memo', 'Escalate malpractice allegations to the vigilance cell', 'Inform student of revised timeline'],
  },
  {
    key: 'admissions', domain: 'education', label: 'Admissions & RTE Seats', dept: 'DSE', baseSeverity: 2,
    description: 'Denied admissions, RTE quota violations, documents demanded unlawfully.',
    keywords: ['admission', 'admissions', 'rte', 'seat', 'denied admission', 'quota', 'enrolment', 'enrollment', 'दाखिला', 'प्रवेश', 'అడ్మిషన్', 'ప్రవేశం'],
    playbook: ['Verify RTE seat allotment list for the institution', 'Direct institution to admit eligible child within 7 days', 'Penalise non-compliance under RTE rules'],
  },
  {
    key: 'midday_meal', domain: 'education', label: 'Mid-day Meals & Hostel Food', dept: 'DSE', baseSeverity: 4,
    description: 'Poor quality, unhygienic or missing mid-day meals; hostel food; food poisoning.',
    keywords: ['mid day meal', 'midday meal', 'mid-day meal', 'food', 'meal', 'worms', 'insects', 'food poisoning', 'hostel food', 'rice', 'egg', 'mdm', 'भोजन', 'खाना', 'మధ్యాహ్న భోజనం', 'భోజనం', 'అన్నం'],
    playbook: ['Food safety officer to collect samples the same day', 'Suspend the cooking agency pending lab report', 'Medical check-up for affected students', 'Install meal-quality monitoring committee with parents'],
  },
  {
    key: 'student_safety', domain: 'education', label: 'Student Safety & Harassment', dept: 'DSE', baseSeverity: 5,
    description: 'Ragging, sexual harassment, abuse, unsafe premises, discrimination against students.',
    keywords: ['ragging', 'harassment', 'harassed', 'abuse', 'molest', 'bullying', 'unsafe', 'discrimination', 'caste', 'girls', 'threat', 'उत्पीड़न', 'रैगिंग', 'వేధింపులు', 'ర్యాగింగ్'],
    playbook: ['Immediately inform the Internal Complaints / Anti-ragging committee', 'Ensure safety of the student and confidentiality of the complainant', 'Register FIR where offence is cognizable', 'Counselling support and follow-up within 24 hours'],
  },

  // ── Healthcare ────────────────────────────────────────────
  {
    key: 'staff_negligence', domain: 'healthcare', label: 'Medical Negligence & Staff Conduct', dept: 'DME', baseSeverity: 4,
    description: 'Doctors/nurses absent, rude, negligent, demanding bribes, wrong treatment.',
    keywords: ['doctor', 'doctors', 'nurse', 'nurses', 'negligence', 'negligent', 'rude', 'misbehave', 'wrong treatment', 'not attended', 'duty doctor', 'staff', 'died due', 'डॉक्टर', 'नर्स', 'लापरवाही', 'డాక్టర్', 'డాక్టర్లు', 'వైద్యుడు', 'నర్సు', 'నిర్లక్ష్యం', 'doctor raledu'],
    playbook: ['Collect duty roster and case sheet within 24 hours', 'Constitute a medical enquiry committee for negligence allegations', 'Issue charge memo to staff if misconduct is established', 'Communicate findings to the complainant'],
  },
  {
    key: 'medicine_availability', domain: 'healthcare', label: 'Medicine & Supply Shortage', dept: 'DCA', baseSeverity: 4,
    description: 'Essential drugs out of stock, patients asked to buy outside, expired stock.',
    keywords: ['medicine', 'medicines', 'drugs', 'tablets', 'out of stock', 'not available', 'buy outside', 'expired', 'pharmacy', 'insulin', 'injection', 'दवा', 'दवाई', 'दवाइयाँ', 'దవాఖానా', 'మందులు', 'మాత్రలు'],
    playbook: ['Check e-Aushadhi stock position at the facility', 'Emergency indent from the central drug store within 48 hours', 'Local purchase authorisation for critical drugs', 'Audit prescriptions directing patients to private pharmacies'],
  },
  {
    key: 'hospital_hygiene', domain: 'healthcare', label: 'Hospital Hygiene & Sanitation', dept: 'DME', baseSeverity: 3,
    description: 'Dirty wards, toilets, biomedical waste, bed bugs, stray animals in hospitals.',
    keywords: ['dirty ward', 'unhygienic', 'hygiene', 'bed bugs', 'biomedical waste', 'filthy', 'ward', 'stink', 'cockroach', 'hospital toilet', 'गंदगी', 'అపరిశుభ్రం'],
    playbook: ['Sanitation supervisor inspection within 24 hours', 'Penalise housekeeping contractor per SLA', 'Biomedical waste audit by pollution control board', 'Daily hygiene checklist display in wards'],
  },
  {
    key: 'access_waiting', domain: 'healthcare', label: 'Access, Queues & Wait Times', dept: 'DPH', baseSeverity: 2,
    description: 'Long OPD queues, PHC closed, no beds, appointment issues, denial of service.',
    keywords: ['queue', 'waiting', 'wait', 'opd', 'no beds', 'bed not available', 'phc closed', 'closed', 'appointment', 'denied treatment', 'refused', 'admission denied', 'घंटों', 'लाइन', 'క్యూ', 'ఆసుపత్రి', 'ఆసుపత్రిలో', 'अस्पताल'],
    playbook: ['Review OPD staffing against patient load', 'Introduce token / slot system at registration', 'Ensure PHC working hours are displayed and adhered to', 'Report weekly wait-time metrics'],
  },
  {
    key: 'billing_overcharge', domain: 'healthcare', label: 'Billing & Overcharging', dept: 'HIS', baseSeverity: 3,
    description: 'Overcharging, illegal fees in government hospitals, inflated private bills.',
    keywords: ['bill', 'billing', 'overcharged', 'charged', 'money demanded', 'paid', 'receipt', 'fees for treatment', 'package', 'बिल', 'पैसे मांगे', 'బిల్లు', 'డబ్బులు'],
    playbook: ['Obtain itemised bill and compare with approved package rates', 'Direct refund of excess amount', 'Penalise / de-empanel repeat offenders'],
  },
  {
    key: 'emergency_services', domain: 'healthcare', label: 'Emergency & Ambulance Services', dept: 'EMS', baseSeverity: 5,
    description: 'Ambulance delays, emergency not attended, casualty mismanagement.',
    keywords: ['ambulance', '108', 'emergency', 'casualty', 'accident', 'not reached', 'delay ambulance', 'critical', 'unconscious', 'trauma', 'एम्बुलेंस', 'इमरजेंसी', 'అంబులెన్స్', 'అత్యవసర'],
    playbook: ['Pull GPS trip log and call record for the dispatch', 'Review fleet availability in the zone at that hour', 'Fix responsibility for delay and retrain dispatch staff', 'Add standby vehicle if zone is chronically under-served'],
  },
  {
    key: 'insurance_claims', domain: 'healthcare', label: 'Health Scheme & Insurance Claims', dept: 'HIS', baseSeverity: 3,
    description: 'Cashless treatment refused, scheme card issues, claim rejections.',
    keywords: ['aarogyasri', 'ayushman', 'insurance', 'claim', 'cashless', 'health card', 'scheme', 'pmjay', 'empanelled', 'आयुष्मान', 'బీమా', 'ఆరోగ్యశ్రీ'],
    playbook: ['Verify beneficiary eligibility and pre-auth logs', 'Direct hospital to honour cashless treatment', 'Reimburse out-of-pocket payment where eligible'],
  },
  {
    key: 'disease_outbreak', domain: 'healthcare', label: 'Disease Outbreak & Public Health Risk', dept: 'DPH', baseSeverity: 5,
    description: 'Dengue, malaria, cholera, contaminated water illness, fever clusters.',
    keywords: ['dengue', 'malaria', 'cholera', 'typhoid', 'fever', 'outbreak', 'diarrhoea', 'diarrhea', 'vomiting', 'mosquito', 'mosquitoes', 'infection', 'epidemic', 'डेंगू', 'बुखार', 'मच्छर', 'మలేరియా', 'జ్వరం', 'దోమలు'],
    playbook: ['Rapid response team to conduct fever survey within 24 hours', 'Fogging and source reduction drive', 'Set up medical camp with diagnostics', 'Coordinate water-quality testing with the Water Board'],
  },

  // ── Public Service ─────────────────────────────────────────
  {
    key: 'water_supply', domain: 'public_service', label: 'Drinking Water Supply', dept: 'WSB', baseSeverity: 4,
    description: 'No water supply, low pressure, contaminated or irregular water.',
    keywords: ['water', 'drinking water', 'no water', 'water supply', 'tap', 'pipeline', 'contaminated water', 'muddy water', 'low pressure', 'tanker', 'borewell', 'पानी', 'पीने का पानी', 'నీరు', 'నీళ్లు', 'త్రాగునీరు', 'మంచినీరు', 'paani', 'neellu'],
    playbook: ['Line inspector to check valve operations and pipeline leaks within 24 hours', 'Deploy water tanker as interim relief', 'Collect water samples for chlorine / contamination tests', 'Restore supply schedule and inform residents'],
  },
  {
    key: 'sanitation_garbage', domain: 'public_service', label: 'Sanitation & Garbage', dept: 'MAD', baseSeverity: 3,
    description: 'Garbage not collected, overflowing bins, open dumping, dead animals.',
    keywords: ['garbage', 'trash', 'waste', 'dustbin', 'bin', 'not collected', 'dumping', 'stink', 'smell', 'dead animal', 'sweeping', 'कचरा', 'कूड़ा', 'गंदगी', 'బదబూ', 'చెత్త', 'చెత్తకుండీ', 'kachra', 'chetta'],
    playbook: ['Sanitary inspector to clear the spot within 24 hours', 'Fix collection route and vehicle schedule', 'Install bins / penalise repeat open dumping', 'Photo proof of clearance to complainant'],
  },
  {
    key: 'roads', domain: 'public_service', label: 'Roads & Potholes', dept: 'MAD', baseSeverity: 3,
    description: 'Potholes, damaged roads, incomplete road work, footpath encroachments.',
    keywords: ['road', 'roads', 'pothole', 'potholes', 'damaged road', 'road work', 'footpath', 'speed breaker', 'encroachment', 'digging', 'सड़क', 'गड्ढा', 'गड्ढे', 'రోడ్డు', 'రోడ్లు', 'గుంతలు', 'గుంత', 'sadak'],
    playbook: ['Engineering section to inspect and barricade hazardous stretch', 'Patch work within 72 hours; full relaying in next works cycle', 'Penalise contractor for defect-liability-period failures'],
  },
  {
    key: 'electricity_streetlights', domain: 'public_service', label: 'Electricity & Streetlights', dept: 'PDC', baseSeverity: 3,
    description: 'Power cuts, voltage fluctuation, transformer faults, streetlights not working, exposed wires.',
    keywords: ['electricity', 'power', 'power cut', 'current', 'transformer', 'voltage', 'streetlight', 'street light', 'streetlights', 'street lights', 'electric pole', 'wire', 'live wire', 'shock', 'sparking', 'sparks', 'outage', 'power outage', 'बिजली', 'लाइट', 'ट्रांसफार्मर', 'कटौती', 'बिजली कटौती', 'ట్రాన్స్‌ఫార్మర్', 'కరెంట్', 'విద్యుత్', 'వీధి దీపాలు', 'bijli', 'current ledu'],
    playbook: ['Lineman to attend fault and isolate any live hazard immediately', 'Replace failed streetlight fittings within 48 hours', 'Load-balance or upgrade transformer if overloaded', 'Share restoration time with complainant'],
  },
  {
    key: 'drainage_sewerage', domain: 'public_service', label: 'Drainage & Sewerage', dept: 'WSB', baseSeverity: 4,
    description: 'Blocked drains, sewage overflow, open manholes, waterlogging.',
    keywords: ['drain', 'drainage', 'sewage', 'sewer', 'manhole', 'overflow', 'overflowing', 'waterlogging', 'flooded', 'gutter', 'nala', 'नाली', 'सीवर', 'नाला', 'కాలువ', 'డ్రైనేజీ', 'మురుగు', 'మ్యాన్‌హోల్'],
    playbook: ['Desilting / jetting machine to clear blockage within 24 hours', 'Cover open manholes immediately and barricade', 'Check cross-contamination with drinking water lines', 'Schedule pre-monsoon desilting'],
  },
  {
    key: 'public_transport', domain: 'public_service', label: 'Public Transport', dept: 'RTC', baseSeverity: 2,
    description: 'Buses not stopping, irregular service, rude crew, overcrowding, bus passes.',
    keywords: ['bus', 'buses', 'conductor', 'driver', 'bus stop', 'route', 'bus pass', 'overcrowded', 'not stopping', 'rtc', 'बस', 'కండక్టర్', 'బస్సు', 'బస్'],
    playbook: ['Review trip logs / GPS for the route and time', 'Counsel or penalise crew for misconduct', 'Adjust frequency on overcrowded routes'],
  },
  {
    key: 'ration_pds', domain: 'public_service', label: 'Ration & Public Distribution', dept: 'CSD', baseSeverity: 3,
    description: 'Ration not distributed, short weighing, shop closed, ration card issues.',
    keywords: ['ration', 'ration card', 'ration shop', 'pds', 'fair price shop', 'dealer', 'rice not given', 'short weight', 'राशन', 'राशन कार्ड', 'రేషన్', 'రేషన్ కార్డు', 'ration ledu'],
    playbook: ['Supply inspector to verify stock register and e-PoS transactions', 'Ensure distribution of pending entitlement', 'Suspend dealer authorisation for diversion / short weighing'],
  },
  {
    key: 'certificates_documents', domain: 'public_service', label: 'Certificates & Documents', dept: 'REV', baseSeverity: 2,
    description: 'Delay in caste, income, residence, birth/death certificates and land records.',
    keywords: ['certificate', 'caste certificate', 'income certificate', 'birth certificate', 'death certificate', 'land record', 'pattadar', 'passbook', 'mutation', 'meeseva', 'pending application', 'प्रमाण पत्र', 'సర్టిఫికేట్', 'ధృవీకరణ పత్రం'],
    playbook: ['Check application status in the service delivery portal', 'Direct the processing officer to dispose within statutory timeline', 'Issue certificate digitally and notify applicant'],
  },
  {
    key: 'corruption', domain: 'public_service', label: 'Bribery & Corruption', dept: 'ACB', baseSeverity: 4,
    description: 'Bribe demands, extortion, misconduct by public servants.',
    keywords: ['bribe', 'bribery', 'corruption', 'corrupt', 'demanded money', 'extortion', 'lanchham', 'rishwat', 'घूस', 'रिश्वत', 'భ్రష్టాచారం', 'లంచం'],
    playbook: ['Forward to vigilance with complainant identity protected', 'Preliminary verification of allegations', 'Trap case / disciplinary proceedings as warranted'],
  },
];

export const categoryByKey = new Map(CATEGORIES.map((c) => [c.key, c]));
export const domainLabel = (k: string | null | undefined) => DOMAINS.find((d) => d.key === k)?.label ?? '—';
export const categoryLabel = (k: string | null | undefined) => (k ? categoryByKey.get(k)?.label ?? k : '—');

export const SEVERITY_LABELS = ['', 'Minimal', 'Low', 'Moderate', 'High', 'Critical'];

/* Signals for context analysis & severity. Mixed-language on purpose. */
export const SIGNALS = {
  lifeSafety: ['death', 'died', 'dead', 'dying', 'fire', 'electrocution', 'electrocuted', 'shock', 'live wire', 'collapse', 'collapsed', 'accident', 'bleeding', 'unconscious', 'poison', 'poisoning', 'suicide', 'assault', 'rape', 'molest', 'drowned', 'open manhole', 'explosion', 'मौत', 'मर गया', 'आग', 'करंट', 'మరణం', 'చనిపోయారు', 'ప్రమాదం', 'మంటలు'],
  vulnerable: ['child', 'children', 'kids', 'student', 'students', 'girl', 'girls', 'infant', 'baby', 'pregnant', 'elderly', 'old age', 'senior citizen', 'disabled', 'handicapped', 'patient', 'patients', 'widow', 'बच्चे', 'बच्चों', 'छात्र', 'बुजुर्ग', 'गर्भवती', 'పిల్లలు', 'పిల్లల', 'విద్యార్థులు', 'వృద్ధులు', 'గర్భిణీ'],
  scale: ['entire', 'whole', 'all residents', 'everyone', 'hundreds', 'thousands', 'colony', 'village', 'locality', 'whole area', 'many families', 'community', 'ward', 'पूरे', 'सभी', 'गांव', 'मोहल्ला', 'కాలనీ', 'కాలనీలో', 'గ్రామం', 'అందరూ'],
  urgency: ['urgent', 'urgently', 'immediately', 'emergency', 'asap', 'critical', 'serious', 'dangerous', 'danger', 'risk', 'तुरंत', 'जल्दी', 'खतरा', 'వెంటనే', 'ప్రమాదకరం'],
  essential: ['water', 'drinking water', 'electricity', 'power', 'medicine', 'ambulance', 'food', 'ration', 'oxygen', 'पानी', 'बिजली', 'दवा', 'నీరు', 'కరెంట్', 'మందులు'],
};

export interface District {
  name: string;
  state: string;
  aliases: string[];
}

export const DISTRICTS: District[] = [
  { name: 'Hyderabad', state: 'Telangana', aliases: ['hyderabad', 'hyd', 'secunderabad', 'ameerpet', 'begumpet', 'charminar', 'mehdipatnam', 'tolichowki', 'banjara hills', 'jubilee hills', 'himayatnagar', 'abids', 'koti', 'malakpet', 'musheerabad', 'amberpet', 'hayathnagar', 'హైదరాబాద్', 'హైదరాబాదు', 'सिकंदराबाद', 'हैदराबाद'] },
  { name: 'Medchal–Malkajgiri', state: 'Telangana', aliases: ['medchal', 'malkajgiri', 'kukatpally', 'uppal', 'kompally', 'alwal', 'boduppal', 'quthbullapur', 'jeedimetla', 'nizampet', 'bachupally', 'కూకట్‌పల్లి', 'ఉప్పల్'] },
  { name: 'Rangareddy', state: 'Telangana', aliases: ['rangareddy', 'ranga reddy', 'gachibowli', 'madhapur', 'hitec city', 'hitech city', 'kondapur', 'lb nagar', 'l.b. nagar', 'dilsukhnagar', 'shamshabad', 'manikonda', 'narsingi', 'vanasthalipuram', 'rajendranagar', 'గచ్చిబౌలి', 'దిల్‌సుఖ్‌నగర్'] },
  { name: 'Sangareddy', state: 'Telangana', aliases: ['sangareddy', 'patancheru', 'ameenpur', 'zaheerabad'] },
  { name: 'Warangal', state: 'Telangana', aliases: ['warangal', 'hanamkonda', 'kazipet', 'వరంగల్', 'हनमकोंडा'] },
  { name: 'Karimnagar', state: 'Telangana', aliases: ['karimnagar', 'huzurabad', 'కరీంనగర్'] },
  { name: 'Nizamabad', state: 'Telangana', aliases: ['nizamabad', 'bodhan', 'armoor', 'నిజామాబాద్'] },
  { name: 'Khammam', state: 'Telangana', aliases: ['khammam', 'kothagudem', 'ఖమ్మం'] },
  { name: 'Nalgonda', state: 'Telangana', aliases: ['nalgonda', 'miryalaguda', 'suryapet', 'నల్గొండ'] },
  { name: 'Mahabubnagar', state: 'Telangana', aliases: ['mahabubnagar', 'mahbubnagar', 'jadcherla', 'మహబూబ్‌నగర్'] },
  { name: 'Adilabad', state: 'Telangana', aliases: ['adilabad', 'nirmal', 'mancherial', 'ఆదిలాబాద్'] },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['visakhapatnam', 'vizag', 'gajuwaka', 'madhurawada', 'విశాఖపట్నం', 'వైజాగ్'] },
  { name: 'Krishna (Vijayawada)', state: 'Andhra Pradesh', aliases: ['vijayawada', 'krishna', 'machilipatnam', 'gannavaram', 'విజయవాడ'] },
  { name: 'Guntur', state: 'Andhra Pradesh', aliases: ['guntur', 'tenali', 'amaravati', 'mangalagiri', 'గుంటూరు'] },
  { name: 'Tirupati', state: 'Andhra Pradesh', aliases: ['tirupati', 'tirumala', 'chittoor', 'srikalahasti', 'తిరుపతి'] },
  { name: 'Nellore', state: 'Andhra Pradesh', aliases: ['nellore', 'kavali', 'నెల్లూరు'] },
  { name: 'Kurnool', state: 'Andhra Pradesh', aliases: ['kurnool', 'nandyal', 'adoni', 'కర్నూలు'] },
  { name: 'Anantapur', state: 'Andhra Pradesh', aliases: ['anantapur', 'anantapuramu', 'hindupur', 'అనంతపురం'] },
  { name: 'East Godavari', state: 'Andhra Pradesh', aliases: ['rajahmundry', 'rajamahendravaram', 'kakinada', 'east godavari', 'రాజమండ్రి', 'కాకినాడ'] },
  { name: 'Bengaluru Urban', state: 'Karnataka', aliases: ['bengaluru', 'bangalore', 'whitefield', 'koramangala', 'indiranagar'] },
  { name: 'Chennai', state: 'Tamil Nadu', aliases: ['chennai', 'madras', 'tambaram', 'adyar'] },
  { name: 'Mumbai', state: 'Maharashtra', aliases: ['mumbai', 'bombay', 'andheri', 'dadar', 'thane'] },
  { name: 'New Delhi', state: 'Delhi', aliases: ['delhi', 'new delhi', 'dwarka', 'rohini', 'दिल्ली'] },
  { name: 'Lucknow', state: 'Uttar Pradesh', aliases: ['lucknow', 'लखनऊ'] },
  { name: 'Patna', state: 'Bihar', aliases: ['patna', 'पटना'] },
];

export const districtNames = DISTRICTS.map((d) => d.name);
