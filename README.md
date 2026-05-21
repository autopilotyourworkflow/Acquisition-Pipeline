# Acquisition Pipeline

Recruiting workflow tool built for [Hotel Plus](https://www.hotelplus.asia) as a 5-day take-home for the Full Stack Developer role.

**Live:** [acq.autopilotyourworkflow.com](https://acq.autopilotyourworkflow.com)
**Assignment brief:** [`ASSIGNMENT.md`](./ASSIGNMENT.md) (Thai, verbatim from Hotel Plus)
**Cowork log:** [`cowork-log.md`](./cowork-log.md) (46 entries — how it was built)

---

## What it does

The four rubric modules in one workflow:

| # | Module | Routes |
|---|---|---|
| 1 | **Candidate Data Scraper** — paste / URL / PDF / screenshot / LinkedIn API, all normalized through one Claude funnel | [`/scraper`](app/(dashboard)/scraper/page.tsx) |
| 2 | **AI Resume Screener** — Opus 4.7 scores 3-axis (skills / experience / culture) with structured tool-use output, streaming UI, editable per-JD persona | [`/screener`](app/(dashboard)/screener/page.tsx), [`/settings/prompts`](app/(dashboard)/settings/prompts/page.tsx) |
| 3 | **Applicant Tracker** — drag-and-drop Kanban (8 stages) + table view + audit-logged stage moves | [`/tracker`](app/(dashboard)/tracker/page.tsx), [`/candidates/[id]`](app/(dashboard)/candidates/[id]/page.tsx) |
| 4 | **Interview Scheduler** — Google Calendar create/cancel/reschedule, conflict warnings, prep briefing page for interviewers | [`/schedule`](app/(dashboard)/schedule/page.tsx), [`/schedule/new`](app/(dashboard)/schedule/new/page.tsx) |

Plus overdelivery: cold-outreach email composer (Gmail send, streaming Claude draft) at [`/candidates/[id]`](app/(dashboard)/candidates/[id]/page.tsx), outbound LinkedIn sourcing via Apify at [`/jds/[id]`](app/(dashboard)/jds/[id]/page.tsx), bookmarklet capture for any logged-in site, any-age undo on every mutation at [`/activity`](app/(dashboard)/activity/page.tsx).

---

## Demo videos

- **Required modules — Modules 1–4** (~3 min) — [https://youtu.be/_T6t36yOKG4](https://youtu.be/_T6t36yOKG4)
  Scraper → Screener → Tracker → Scheduler, end-to-end.
- **Overdelivery — Modules 5–7** — [https://youtu.be/VpBGl11wIFo](https://youtu.be/VpBGl11wIFo)
  Cold-outreach email composer (5), LinkedIn sourcing (6), and a public-facing HR SOP page (7) — built as a gift to Hotel Plus regardless of hire outcome.

---

## For reviewers

Quickest path to seeing it work:

1. Open the **live URL**: [acq.autopilotyourworkflow.com](https://acq.autopilotyourworkflow.com)
2. **Sign in.** Two paths:
   - *Email OTP* (works for any email) — enter your address, get a code, done.
   - *Google OAuth* — the project is in Google's Testing mode. The following emails are pre-allowlisted as test users:
     - a.prabt@gmail.com
     - career@hotelplus.asia
     - datapoints@hotelplus.asia
     - parich.phew@gmail.com

   If your address isn't here, use the OTP path or email me to be added.
3. **First user becomes owner** automatically. You'll land on the dashboard.
4. **Suggested 5-minute tour:**
   1. `/jds` — open a JD (the seed includes "Full Stack Developer")
   2. `/scraper` — paste a CV, watch it normalize via Claude → save
   3. `/screener` — score the saved candidate against the JD (3-axis Opus + streaming)
   4. `/tracker` — drag the candidate across stages (every move is audit-logged + undoable)
   5. `/schedule/new` — book an interview (Google Calendar event + Hotel Plus invite + conflict warning)
5. **Code tour:** the three "spine" files are [`lib/audit/wrap.ts`](lib/audit/wrap.ts), [`lib/anthropic/client.ts`](lib/anthropic/client.ts), and [`lib/scrape/normalize.ts`](lib/scrape/normalize.ts). Everything else composes against these.
6. **Cowork log:** [`cowork-log.md`](cowork-log.md) is the AI-collaboration deliverable. Start with entries #1, #6, #20, #40 for prompt-engineering decisions; #45–47 for the redesign + SOP work.

---

## Rubric scorecard

Where each grading criterion lives in the code.

| Criterion (weight) | Where to look | Notes |
|---|---|---|
| **Feature Completeness (30%)** — 4 modules working | Modules table above + [`app/(dashboard)`](app/(dashboard)/) routes | 4/4 shipped + 3 overdelivery (cold email, sourcing, public SOP) |
| **Code Quality & Architecture (30%)** | The 7 architecture decisions below + the three spine files | Strict TS, single mutation spine, single Claude client, zod-schema-as-contract, RLS-by-default |
| **UX & Usability (25%)** | Live URL + the 5-minute tour above | Hotel Plus brand applied (yellow/black/white), Kanban + Schedule-X calendar, streaming score UI, editable preview before save |
| **AI Integration (15%)** | [`lib/anthropic/`](lib/anthropic/) (tools + prompts + client) + [`cowork-log.md`](cowork-log.md) entries on prompt iteration | Tool-use forcing everywhere (no free-form JSON parsing), per-JD persona override, prompt caching on JD body, cost telemetry per call |
| **Cowork Log (Bonus)** | [`cowork-log.md`](cowork-log.md) | 46 first-person entries across the 5-day build |
| **Live URL (Bonus)** | [acq.autopilotyourworkflow.com](https://acq.autopilotyourworkflow.com) | Vercel + Cloudflare DNS |

---

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, Turbopack)
- **TypeScript** strict mode
- **Tailwind v4** + shadcn/ui primitives — fully token-driven, zero hardcoded hex
- **Supabase** — Auth (Google OAuth + email-OTP), Postgres with RLS, Storage for CVs
- **Anthropic Claude** — Opus 4.7 for scoring/vision/cold-email, Haiku 4.5 for cheap normalization
- **Google APIs** — Calendar (events.insert / events.list / events.patch) + Gmail send (hand-rolled MIME, no `googleapis` dependency for the send path)
- **Vercel** deploy + Cloudflare DNS

---

## Architecture decisions

Things the codebase commits to, on purpose. Each one is one place to read, one place to change.

### 1. Every mutation goes through `withAudit`
[`lib/audit/wrap.ts`](lib/audit/wrap.ts) is an HOF that wraps any DB write in a hash + log entry. The activity feed is just `SELECT * FROM activity_log`; undo is a generic "revert any logged change" — not feature-specific. Adding a new mutable surface means writing the mutation closure and getting audit + undo for free.

### 2. Every Claude call goes through one client
[`lib/anthropic/client.ts`](lib/anthropic/client.ts) — single SDK wrapper with retry, prompt-cache markers, cost telemetry, and tool-use forcing. Zero `@anthropic-ai/sdk` imports anywhere else. Cost tracking + cache hit rate are uniform across surfaces.

### 3. Structured output via tool-use forcing, never free-form JSON parsing
Every AI surface that returns structured data uses a tool definition with a zod schema. The schema *is* the contract: it's the `input_schema` Claude sees, the runtime validator, and the typed return value. No parallel "what Claude returns" type that drifts. Tools live in [`lib/anthropic/tools/`](lib/anthropic/tools/).

### 4. Single normalize path for the scraper
[`lib/scrape/normalize.ts`](lib/scrape/normalize.ts) is the funnel for all five input types (paste / URL / PDF / screenshot / third-party). One save path, one validation, one place to debug a weird CV. Adding a new source means writing the fetch and ending at `normalizeCandidate({ text })`.

### 5. Row-level security as the default, service-role as the escape hatch
RLS policies on every table enforce per-org isolation; [`lib/supabase/server.ts`](lib/supabase/server.ts) is user-scoped. [`lib/supabase/admin.ts`](lib/supabase/admin.ts) is service-role for the narrow cases where RLS gets in the way (cross-user `oauth_tokens` lookup, audit log writes). The admin client is **server-only** and never imported into a `'use client'` file.

### 6. Tokens, not values
All visual styling goes through `@theme inline` in [`app/globals.css`](app/globals.css). Zero hardcoded hex in any `.tsx` file. The mid-project visual rebrand to Hotel Plus's yellow/black/white was a 30-minute CSS swap — every shadcn primitive picked up the new register automatically.

### 7. Decoupled identity from API permissions
Sign-in (Google OAuth or email-OTP) is decoupled from Google API scopes. Calendar + Gmail scopes are granted in `/settings/integrations`, not at sign-in. Email-OTP users can still use 90% of the app — they just can't auto-schedule or send.

---

## Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- An Anthropic API key
- A Google Cloud project with OAuth client + Calendar + Gmail scopes enabled

### 1. Clone + install
```bash
git clone https://github.com/autopilotyourworkflow/Acquisition-Pipeline.git
cd Acquisition-Pipeline
npm install
```

### 2. Environment
Copy [`.env.example`](.env.example) to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never exposed to the client

# Anthropic
ANTHROPIC_API_KEY=

# Google OAuth (handled by Supabase Auth provider — set in Supabase dashboard)
# Required scopes: openid email profile calendar.events calendar.freebusy gmail.compose gmail.send

# AES-256-GCM secret for encrypting OAuth refresh tokens at rest
# Generate: `openssl rand -base64 32`
OAUTH_ENCRYPTION_SECRET=

# Optional — for outbound LinkedIn sourcing
APIFY_API_TOKEN=                    # if set as system default; otherwise users provide their own
```

### 3. Database
Apply migrations in order — they're plain SQL in [`supabase/migrations/`](supabase/migrations/):

```bash
# In Supabase SQL editor, run each file 0001 → 0011 in numerical order.
# Or via the Supabase CLI:
supabase db push
```

The first user to sign in becomes `owner` automatically via the `handle_new_user()` trigger.

**Optional — populate demo data:** paste [`supabase/seed_demo.sql`](supabase/seed_demo.sql) into the Supabase SQL Editor to get 2 sample JDs (Full Stack Developer + Hotel Operations Manager) and 8 candidates spread across the Kanban funnel. Idempotent — safe to re-run.

### 4. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

### 5. Deploy
- Vercel: import the repo, paste env vars, deploy.
- DNS: point your apex/subdomain at Vercel's nameservers (or use a CNAME). Supabase Auth callback URL must include the production domain.

---

## Project structure

```
app/
  (auth)/login/              Sign-in (Google OAuth + email-OTP)
  (dashboard)/
    tracker/                 Kanban + Table (Module 3)
    screener/                Score-a-candidate flow (Module 2)
    scraper/                 5-tab scraper (Module 1)
    schedule/                Interview list + Schedule-X calendar (Module 4)
    schedule/new/            Booking form with conflict detection
    candidates/[id]/         Candidate detail + scores + cold-email launcher
    jds/                     JD list + editor + sourcing dialog
    interviews/[id]/prep/    Staff-only prep briefing (linked from invite)
    activity/                Audit log with any-age undo
    settings/
      prompts/               Edit the org-wide scoring persona
      integrations/          OAuth scopes + API keys + email defaults
      capture/               Bookmarklet + (placeholder) auto-email-reader
  api/                       Route handlers — scrape, score, attachments, etc.
  actions/                   Server Actions (all wrap withAudit)
  page.tsx                   Marketing landing
  icon.jpg                   Favicon (Hotel Plus logo)

lib/
  anthropic/
    client.ts                Single Claude SDK wrapper
    tools/                   Zod-typed tool definitions
    prompts/                 Persona prompts (scoring, cold-email, manager)
  audit/wrap.ts              withAudit HOF + row-hashing helpers
  auth/current-user.ts       Request-cached supabase.auth.getUser()
  google/                    Calendar + Gmail clients
  scrape/normalize.ts        Single normalize funnel
  supabase/                  server / browser / admin / middleware
  db/                        Shared types, enums, constants
  short-links.ts             /l/<slug> shortener for CV links in invites

components/
  ui/                        shadcn primitives + Toaster
  candidates/                StageBadge, SourceBadge
  emails/                    ColdEmailDialog + Launcher
  interviews/                InterviewActions (reschedule + cancel)
  schedule/                  ConflictWarning
  screener/                  ScoreCard + ScoreStream

docs/
  redesign/design.md         Locked Hotel Plus brand spec

supabase/migrations/         11 SQL migrations, applied in order
```

---

## What's deliberately deferred

Shipped as roadmap placeholders rather than half-implementations:

- **AI prompt-builder interview** (`/jds/[id]` → "Advanced — custom scoring persona") — a Haiku-driven Q&A that drafts a tailored scoring persona for the JD. UI exists; the SSE chat endpoint is the Phase 4a work item.
- **Auto-import from Gmail** (`/settings/capture` → "Auto-import from Gmail") — Vercel Cron polls a user's inbox for resume attachments and auto-creates+scores candidates. UI exists; the cron handler + Gmail watch config table is Phase 4c.

These two are intentionally surfaced in the UI as `coming soon` so the reviewer sees the roadmap without the features misleading on functionality.

The **bookmarklet** at `/settings/capture` is shipped and working — drag it to the bookmarks bar, sign in to LinkedIn / JobsDB / any other site, click the bookmarklet, and the page contents land in the scraper for normalize+save. A native Chrome MV3 extension is the eventual upgrade but isn't blocking — the bookmarklet covers the same capture path with the user's existing browser session.

---

## Repo files you'll see at the root (and what each is)

| File | What it is |
|---|---|
| [`README.md`](README.md) | This file. |
| [`ASSIGNMENT.md`](ASSIGNMENT.md) | The original Hotel Plus brief, kept verbatim for reference. |
| [`cowork-log.md`](cowork-log.md) | The Cowork Log deliverable. 46 first-person entries on what got built, why, and what didn't. |

---

## What to read first

For an architectural sense: [`lib/audit/wrap.ts`](lib/audit/wrap.ts) (the audit spine) + [`lib/anthropic/client.ts`](lib/anthropic/client.ts) (the Claude client) + [`lib/scrape/normalize.ts`](lib/scrape/normalize.ts) (the scrape funnel). Each is one file; together they're the patterns most other files compose against.

For the narrative behind the build: [`cowork-log.md`](cowork-log.md) — 46 first-person entries spanning the 5 days. Entry #45 is a frank pre-redesign audit ("what shipped, what's worth keeping, what's worth a second pass"); entry #46 covers the visual rebrand and the perf wins that surfaced along the way.

For the rubric mapping: see the **Rubric scorecard** table near the top of this README.
