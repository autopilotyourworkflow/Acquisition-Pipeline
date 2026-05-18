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
| 1 — Foundation (scaffold, DB schema, auth, deploy) | Day 1 | code complete; pending: migration apply + login test + Vercel deploy |
| 2 — AI core (Resume Screener + Applicant Tracker) | Day 2 | not started |
| 3 — Scraper + Scheduler basics | Day 3 | not started |
| 4 — Overdelivery (cold email, FreeBusy, undo/redo, invites) | Day 4 | not started |
| 5 — Browser extension + polish + demo | Day 5 | not started |
| 6 — Final Phase: secrets audit + handoff | end | not started |

Update this table at the end of each phase. Append a fresh entry to `cowork-log.md` after every major decision or successfully completed module.
