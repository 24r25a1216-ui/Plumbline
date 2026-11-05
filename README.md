# Plumbline — Multi-Domain Grievance Intelligence

A complete implementation of the *Multi-Domain Grievance Management System* specification (FR1–FR25). Citizens can file complaints in **Telugu, Hindi or English**. An NLP/AI pipeline detects and translates the language, classifies the complaint, weighs severity and priority, locates it, finds duplicates and precedents, and drafts a resolution. An official verifies and corrects the result before the complaint is routed to a department. Progress is tracked live, escalates automatically, and citizen ratings and official corrections feed back into the models.

## Quick start

```bash
npm install
npm run dev          # API on :4000, web on :5173 (seeds demo data on first run)
```

Open http://localhost:5173. The login pages have one-click demo accounts:

| Role | Email | Password |
|---|---|---|
| Grievance-cell admin | `admin@plumbline.gov.in` | `Admin@123` |
| Department officer | `wsb.officer@plumbline.gov.in` (any `<code>.officer@plumbline.gov.in`) | `Officer@123` |
| Citizen | `citizen@plumbline.in` | `Citizen@123` |

Other scripts: `npm run reset` (wipe and reseed), `npm run smoke` (end-to-end API test against a running server), `npm run build && npm start` (production build: one server on :4000 serves both the API and the UI).

## OpenAI

The system runs fully on its **built-in local NLP engine**: script analysis, a phrase glossary, a Naive Bayes classifier trained on the taxonomy and verified cases, TF-IDF similarity, and rule-based severity and priority. To turn on the LLM engine, use either of these:

- copy `.env.example` → `.env` and set `OPENAI_API_KEY`, **or**
- paste the key in **Admin → System settings**, then click *Test*.

With a key, the pipeline adds neural translation, LLM classification with rationale (cross-checked against the local model), contextual severity and location, embedding-based duplicate search, and resolution synthesis grounded in past cases. If any OpenAI call fails, that stage falls back to the local engine and the trace marks it as a fallback. The default model is `gpt-4.1-mini`; you can change it in settings.

## Requirement map

| FR | Where |
|---|---|
| 1–2 Auth, separate role-based staff portal | `server/src/auth.ts`, `routes/auth.ts`, `/login`, `/staff/login` |
| 3–4 Web form + evidence uploads | `pages/citizen/NewComplaint.tsx`, multer in `routes/complaints.ts` |
| 5–6 Language detection & translation | `server/src/ai/language.ts`, `llm.ts#llmTranslate` |
| 7 Cleaning, PII masking, tokenisation, stemming | `server/src/ai/preprocess.ts` |
| 8–10 Domain/category + confidence analysis | `ai/classifier.ts`, `llm.ts#llmAnalyze`, `pipeline.ts#confidenceAnalysis` |
| 11–13 Severity, priority, location | `ai/assess.ts` (explainable, itemised priority score) |
| 14–15 Department routing & assignment | `pipeline.ts` routing stage, `POST /complaints/:id/verify` |
| 16–18 Duplicates, history, recommendations | `ai/similarity.ts`, `llm.ts#llmRecommend` |
| 19–20 Admin review & correction | `pages/admin/CaseFile.tsx` (verification panel, overrides) |
| 21–22 Real-time tracking & status stages | SSE in `server/src/events.ts`, `lib/live.tsx`, status machine in `services.ts` |
| 23 Auto-escalation (overdue / P1 / stuck in verification) | `server/src/jobs/escalation.ts` |
| 24 Feedback, reopen on dissatisfaction | `POST /complaints/:id/feedback` |
| 25 Corrections → learning | `corrections` table, few-shot memory in `llm.ts`, retraining in `classifier.ts`, **Admin → AI insights** |

## Stack

Node 22.5+ (built-in `node:sqlite`, no native build), Express, Zod, JWT httpOnly sessions, and Server-Sent Events · React 18, TanStack Query, React Router and Vite. The design system is hand-written CSS: the "Graphite & Lichen" palette with a dark default and a light "Paper" theme, set in Familjen Grotesk, Newsreader and Martian Mono. Charts are hand-drawn SVG.

## Expanded demo data & notifications

- The seed corpus now contains **94 complaint examples** (44 original + 50 additional examples across the supported grievance categories). Each example is passed through the built-in NLP pipeline, and the local classifier is trained from the resulting verified complaint history. The added records are clearly synthetic demo records, not real citizen submissions.
- The citizen case page shows the assigned officer's name, department, email and phone after an administrator verifies and assigns the complaint.
- Filing a complaint creates an in-app confirmation and attempts a confirmation email. Assignment sends a second update with the assigned officer's contact details.
- To enable email, configure a Resend API key and a verified sender in `.env`:

```env
RESEND_API_KEY=re_your_key
EMAIL_FROM=Plumbline <notifications@your-verified-domain.in>
```

  Email delivery is intentionally optional: without these values, in-app notifications still work. Resend must have the sender domain verified. See https://resend.com/docs/send-with-nodejs (the project calls its HTTP API directly and needs no extra package).
- Citizens and staff can enable browser/device notifications from the Notifications drawer. These are delivered while the app's live connection is active (including a foreground mobile browser); background delivery after the browser is fully closed requires a separately configured Web Push/VAPID service.
- Feedback can be submitted once per resolution. If a complaint is reopened and later resolved again, the citizen can submit feedback on that new resolution. A reopen request outside the configured reopen window is rejected with a clear message rather than silently closing the case.

After replacing the project files, run `npm run reset` once to wipe and reseed the local demo database with the expanded complaint corpus. This reset deletes existing local demo data.
