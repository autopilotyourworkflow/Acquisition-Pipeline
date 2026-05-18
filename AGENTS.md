<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notable Next.js 16 specifics:
- `middleware.ts` is renamed to `proxy.ts` at the project root; export a `proxy()` function.
- `cookies()` is async — `const c = await cookies()`.
- Turbopack is the default dev + build pipeline.
<!-- END:nextjs-agent-rules -->

# Acquisition Pipeline — agent briefing

## What this project is
Recruiting Pipeline Tool — a take-home assignment for **Hotel Plus** (hotelplus.asia), a Thai hotel-management consulting firm hiring a Full Stack Developer. The app runs HR's full recruiting workflow in one place: scrape candidates, score with Claude, track in a Kanban, schedule interviews via Google Calendar, draft cold-outreach emails via Gmail. Deadline is 5 days from 2026-05-18.

## Read these first, in this order
1. `PROJECT_MASTER.md` — the original assignment brief with the grading rubric and module requirements
2. `cowork-log.md` — every major decision made so far, with rationale (the bonus deliverable)
3. The approved implementation plan at `C:\Users\chano\.claude\plans\let-s-start-planning-addition-prancy-glade.md`
4. The personal memory at `C:\Users\chano\.claude\projects\e--BEAM-Work-Antigravity-Workspaces-Resume-Screener\memory\MEMORY.md`

## Tech stack (locked — do not revisit)
- Next.js 16 (App Router, TypeScript) + Tailwind v4 + shadcn/ui primitives
- Supabase (Auth + Postgres + Storage + RLS) — single-org model, hardcoded `org_id`
- Claude only: `claude-opus-4-7` for scoring/email/vision; `claude-haiku-4-5` for cheap normalization
- Vercel deploy + Cloudflare DNS → `acq.autopilotyourworkflow.com`

## Brand tokens (locked)
Navy `#17202E` + Cream `#FAF7F2` + Terracotta `#BD5B3C`. Fraunces (display) + Inter (body) + JetBrains Mono. No gradients, max radius 8px, subtle shadows. See `app/globals.css` for the full token set.

## Architectural conventions
- Every mutation goes through `lib/audit/wrap.ts:withAudit()` so the activity log + undo backbone gets every change.
- Every Claude call goes through `lib/anthropic/client.ts` (single retry / cache / telemetry wrapper).
- Structured output from Claude uses tool-use forcing — never free-form JSON parsing. Tool schemas live in `lib/anthropic/tools/`.
- Service-role Supabase client (`lib/supabase/admin.ts`) is server-only — never import from a `'use client'` file.
- Scraping fallbacks all funnel through `lib/scrape/normalize.ts` so there's one save path.
- 2-tier roles: `owner` + `member`. First signup becomes owner automatically via the `handle_new_user()` trigger.
- Auth has two paths (Google OAuth + Email OTP) and is decoupled from Google API permissions — Calendar/Gmail scopes are granted separately in Settings → Integrations.

## Preferences observed
- **Function before form.** Don't pause feature work to polish a screen mid-build — visual polish is its own pass after the Day-4 MVP cut line. Brand tokens are locked, what's underwhelming is layout/copy and that's intentional for now.
- **Explain WHY.** The user is a "vibe coder" — strong intuition, less formal jargon. When concepts come up (architecture choices, library trade-offs, OAuth flows), explain the reasoning, not just the command.

## Secrets policy
- All real secret values live in `.env.local` (gitignored) and in Vercel's Environment Variables UI for production.
- `.env.example` is committed but contains only KEY names with no values.
- Never echo secret values back to the user in chat.
- Final-phase secrets audit (see plan) rotates everything before the repo flips to public.

## Build progress

| Phase | Days | Status |
|---|---|---|
| 1 — Foundation (scaffold, DB schema, auth, deploy) | Day 1 | ✅ deployed to `acq.autopilotyourworkflow.com`, login verified end-to-end with both code + magic-link |
| 2 — AI core (Resume Screener + Applicant Tracker) | Day 2 | ✅ `withAudit` HOF + Claude client (retry / cache / telemetry / tool-use forcing) + `scoring.v1` prompt + Tracker (Kanban + Table + JD CRUD) + Screener (SSE stream, ScoreCard, unpdf upload). Live smoke test: 8.60 weighted in 26s at $0.16 against seed JD. |
| 3 — Scraper + Scheduler basics | Day 3 | not started |
| 4 — Overdelivery (cold email, FreeBusy, undo/redo conflict, invites, **auto-email-reader**) | Day 4 | not started |
| 5 — Browser extension + polish + demo | Day 5 | not started |
| 6 — Final Phase: secrets audit + handoff | end | not started |

Update this table at the end of each phase. Append a fresh entry to `cowork-log.md` after every major decision or successfully completed module.

## Phase 4 — auto-email-reader feature (added 2026-05-19)

A user-requested overdelivery feature added during Phase 2 conversations:

**Goal:** automatically watch a chosen Gmail inbox for incoming candidate emails (resumes, CVs, cover letters as PDF attachments) and auto-create + auto-score the candidates against a default JD. Opt-in, per-user.

**Implementation sketch** (Day 4):
- Add `gmail.readonly` to the bundled OAuth scopes in `app/(auth)/login/login-form.client.tsx`. Drop `prompt=consent` only if we need to re-prompt existing users; otherwise add the scope to the request list and Google will re-consent on next sign-in.
- New table `gmail_watch_configs` (one per user): `user_id`, `is_active`, `from_filter` (optional list of allowed senders), `subject_filter` (default: `resume OR CV OR "cover letter" OR application`), `default_jd_id`, `last_polled_at`, `last_message_id`.
- New endpoint `app/api/cron/gmail-poll/route.ts` invoked by Vercel Cron every 15 minutes (`vercel.json` cron config). For each active config:
  - Decrypt + refresh the user's Google access token via `oauth_tokens`.
  - `gmail.users.messages.list?q=...&after=<last_polled_at>` to find new matches.
  - For each message: download any PDF attachments, run them through `app/api/attachments/upload` logic (hash-dedup'd), create a `candidates` row with `source: 'email'` (new enum value — migration), trigger a single-mode score against the configured default JD.
  - Update `last_polled_at` + `last_message_id` to skip the same message next poll.
- UI at `/settings/integrations`: toggle, sender filter, default JD picker, last-poll status.
- Notifications: in-app "New candidate auto-scored" toast or a "New" badge on the tracker (push beyond scope for take-home — could be Day 5 polish).

**Why Phase 4:** depends on Phase-3 work (Gmail OAuth flow + Calendar integration patterns) and the scoring pipeline being solid. Slots cleanly into the existing scrape → score → email-draft pipeline.

**Status:** PLANNED, not yet built.

---

## Cowork-log voice
The cowork log is a graded deliverable. Read the existing entries before adding a new one — match their voice. The voice is:
- First-person, narrative, opinionated. The user is the protagonist making the call; AI is the collaborator.
- Show *thinking*, not specs. The plan file has the specs. The log captures the reasoning that produced them.
- One date marker per day (e.g. `*Day 2 — 2026-05-19*`) inserted once before that day's first entry. Don't repeat the date on every entry.
- Skip the Objective/Pros/Cons/Outcome template for routine entries. Use it only where the structure adds clarity.
- Each entry: ~150–300 words. Bold the key takeaway. Lead with the framing question.
- Goal: a reviewer skimming this should feel they understand how this team thinks, not just what was built.
