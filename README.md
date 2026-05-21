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
  phase-*.md                 Per-phase handoff prompts (build history)

supabase/migrations/         11 SQL migrations, applied in order
```

---

## What's deliberately deferred

Shipped as roadmap placeholders rather than half-implementations:

- **AI prompt-builder interview** (`/jds/[id]` → "Advanced — custom scoring persona") — a Haiku-driven Q&A that drafts a tailored scoring persona for the JD. UI exists; the SSE chat endpoint is the Phase 4a work item.
- **Auto-import from Gmail** (`/settings/capture` → "Auto-import from Gmail") — Vercel Cron polls a user's inbox for resume attachments and auto-creates+scores candidates. UI exists; the cron handler + Gmail watch config table is Phase 4c.
- **Browser extension** — the bookmarklet at `/settings/capture` covers the MVP capture path. A proper Chrome MV3 extension is the eventual upgrade.

These are intentionally surfaced in the UI as `coming soon` so the reviewer sees the roadmap without the features misleading on functionality.

---

## What to read first

For an architectural sense: [`lib/audit/wrap.ts`](lib/audit/wrap.ts) (the audit spine) + [`lib/anthropic/client.ts`](lib/anthropic/client.ts) (the Claude client) + [`lib/scrape/normalize.ts`](lib/scrape/normalize.ts) (the scrape funnel). Each is one file; together they're the patterns most other files compose against.

For the narrative behind the build: [`cowork-log.md`](cowork-log.md) — 46 first-person entries spanning the 5 days. Entry #45 is a frank pre-redesign audit ("what shipped, what's worth keeping, what's worth a second pass"); entry #46 covers the visual rebrand and the perf wins that surfaced along the way.

For the rubric mapping: [`AGENTS.md`](AGENTS.md) maps each rubric module to its implementation location and status.
