export type Role = 'citizen' | 'officer' | 'admin';
export type Status =
  | 'submitted' | 'analyzing' | 'awaiting_verification' | 'assigned' | 'in_progress' | 'on_hold'
  | 'resolved' | 'closed' | 'reopened' | 'withdrawn' | 'rejected' | 'merged';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Domain = 'education' | 'healthcare' | 'public_service';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string;
  preferredLang: 'en' | 'hi' | 'te';
  department: { id: number; code: string; name: string } | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ComplaintSummary {
  id: number;
  ref: string;
  title: string;
  status: Status;
  statusLabel: string;
  domain: Domain | null;
  domainLabel: string;
  category: string | null;
  categoryLabel: string;
  severity: number | null;
  priority: Priority | null;
  confidence?: number | null;
  district: string | null;
  locationText: string | null;
  language: 'en' | 'hi' | 'te' | null;
  department: { id: number; code: string; name: string } | null;
  assignedOfficer?: { id: number; name: string; email: string; phone: string } | null;
  escalationLevel: number;
  escalatedAt: string | null;
  escalationReason: string | null;
  slaDueAt: string | null;
  overdue: boolean;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
  duplicateScore?: number | null;
  aiEngine?: string | null;
  analyzing: boolean;
  citizen?: { name: string; email: string; phone: string };
}

export interface TraceStage {
  key: string;
  label: string;
  fr: string;
  status: 'done' | 'fallback' | 'failed' | 'skipped';
  engine: 'openai' | 'local' | 'rules';
  ms: number;
  summary?: string;
  note?: string;
}

export interface Match {
  id: number; ref: string; title: string; status: Status; domain: string | null; category: string | null; district: string | null;
  similarity: number; sameUser: boolean; createdAt: string; resolutionNote: string | null; resolvedInDays: number | null; rating: number | null;
  reason?: string;
}

export interface Analysis {
  version: number;
  engine: 'openai' | 'local' | 'hybrid';
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  language: { code: 'en' | 'hi' | 'te'; label: string; script: string; confidence: number; method: string; scripts: { telugu: number; devanagari: number; latin: number }; romanized: boolean; aiConfirmed?: boolean };
  translation: { text: string; method: 'none' | 'openai' | 'glossary'; coverage: number | null; notes: string };
  preprocess: { cleaned: string; normalized: string; tokens: string[]; terms: string[]; bigrams: string[]; stats: { characters: number; sentences: number; tokens: number; terms: number; unique: number; stopwordsRemoved: number; piiMasked: number } };
  classification: {
    domain: Domain; category: string; confidence: number; rationale: string; evidence: string[];
    alternatives: { domain: Domain; category: string; confidence: number }[];
    local: { domain: Domain; category: string; confidence: number; alternatives: { domain: Domain; category: string; confidence: number }[]; evidence: string[]; coverage: number };
    llm: { domain: Domain; category: string; confidence: number } | null;
    agreement: 'full' | 'domain' | 'none' | 'n/a';
  };
  confidence: { score: number; level: 'high' | 'medium' | 'low'; needsReview: boolean; signals: { label: string; value: string; effect: number }[] };
  context: { lifeSafety: string[]; vulnerable: string[]; scale: string[]; urgency: string[]; essential: string[]; durationDays: number | null; scope: string; sentiment: string | null; actionable: boolean; mixed: boolean };
  severity: { level: number; label: string; factors: { label: string; weight: number }[]; justification: string; source: string };
  priority: { priority: Priority; score: number; breakdown: { label: string; points: number }[] };
  location: { text: string; locality: string | null; district: string | null; state: string | null; pincode: string | null; source: string; confidence: number; mentions: string[] };
  routing: { departmentId: number | null; departmentCode: string; departmentName: string; office: string; slaHours: number; reasons: string[] };
  similarity: { engine: string; duplicates: Match[]; similar: Match[]; history: Match[]; thresholds: { duplicate: number; similar: number }; corpusSize: number; fallbackReason?: string };
  recommendation: { actions: string[]; expectedDays: number; rationale: string; referenced: string[]; citizenMessage: string; source: string };
  summary: string;
  trace: TraceStage[];
}

export interface CitizenAnalysis {
  summary: string;
  language: { code: string; label: string };
  translation: { method: string };
  recommendation: { citizenMessage: string; expectedDays: number } | null;
  trace: TraceStage[];
}

export interface ComplaintEvent {
  id: number;
  type: 'status' | 'comment' | 'ai' | 'correction' | 'escalation' | 'feedback' | 'attachment' | 'assignment';
  from: Status | null;
  to: Status | null;
  message: string;
  meta: any;
  visibility: 'public' | 'internal';
  createdAt: string;
  actor: { name: string | null; role: Role | null } | null;
}

export interface ComplaintDetail extends ComplaintSummary {
  body: string;
  bodyEnglish: string | null;
  translationMethod: string | null;
  locationInput: string;
  districtInput: string;
  pincode: string;
  incidentDate: string | null;
  resolutionNote: string | null;
  reopenCount: number;
  duplicateOf: { id: number; ref: string; status: Status } | null;
  events: ComplaintEvent[];
  attachments: { id: number; filename: string; mime: string; size: number; createdAt: string }[];
  feedback: { rating: number; satisfied: boolean; comment: string; createdAt: string } | null;
  ai: Analysis | CitizenAnalysis | null;
  aiError?: string | null;
  corrections?: { field: string; aiValue: string | null; finalValue: string; note: string; source: string; createdAt: string; actor: string }[];
  permissions: {
    canWithdraw: boolean; canComment: boolean; canAttach: boolean; canFeedback: boolean; canReopen: boolean; canVerify: boolean;
    canReanalyze: boolean; canUpdateStatus: boolean; canReturn: boolean; canReassign: boolean; canEscalate: boolean;
  };
  reopenDeadline: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  statusCounts: Record<string, number>;
}

export interface Taxonomy {
  domains: { key: Domain; label: string; blurb: string }[];
  categories: { key: string; domain: Domain; label: string; description: string; dept: string; baseSeverity: number }[];
  districts: { name: string; state: string }[];
  departments: { id: number; code: string; name: string; domain: Domain; description: string; slaHours: number; active: number }[];
}

export interface Notification {
  id: number;
  complaint_id: number | null;
  ref: string | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}
