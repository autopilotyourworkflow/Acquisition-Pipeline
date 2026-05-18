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
| 2 — AI core (Resume Screener + Applicant Tracker) | Day 2 | ✅ **COMPLETE.** Foundation (`withAudit` HOF + Claude client w/ retry/cache/telemetry/tool-use forcing + `scoring.v1` prompt). Tracker (Kanban + Table + JD CRUD, click-through, score badges, drag w/ UndoToast). Screener (SSE stream, ScoreCard, unpdf upload + dedup, model picker, team-mode 3+1, score history). Editable prompts (`/settings/prompts`), per-JD overrides, `/activity` audit log, any-age Undo, candidate detail page, bundled OAuth scopes. 20 cowork-log entries. Migrations 0001-0004 applied. |
| 3 — Scraper + Scheduler basics | Day 3 | next up — see `docs/phase-3-prompt.md` for the session handoff |
| 4 — Overdelivery (cold email, FreeBusy, undo/redo conflict, invites, **auto-email-reader**, **AI prompt-builder interview**) | Day 4 | not started |
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

## Phase 4 — AI prompt-builder interview (added 2026-05-19)

A user-requested overdelivery feature: when a user creates or edits a JD, offer an AI-driven "interview" that asks 4-6 focused questions about the role and then drafts a tailored scoring persona for it. Output gets saved as the JD's `scoring_persona_override`.

**Why this matters:** the per-JD prompt override (Phase 2, migration 0004) is powerful but cold-start hostile — most users won't know how to write a good scoring persona from scratch. This feature turns the override from a power-user feature into something anyone can use well.

**Flow (UX):**
1. On the JD editor page (`app/(dashboard)/jds/jd-editor.client.tsx`), next to the "Advanced — custom scoring persona" section, add a button: **"AI-assisted: help me write this"**.
2. Click → opens a chat-style dialog (or sidesheet) running Haiku 4.5.
3. The interviewer asks the user one or two questions at a time, conversationally — not all at once. Questions cover:
   - Seniority bracket (entry / mid / senior / principal / executive)
   - The single most important quality (shipping speed / technical depth / collaboration / business acumen / creative judgment / domain expertise)
   - Anti-bias considerations specific to this role (e.g., for design roles: "don't penalize CVs without CS coursework"; for sales: "weight outcomes over titles")
   - Describe a candidate this team would call to congratulate (the 9/10 picture)
   - Describe a candidate that would clearly miss (the 3/10 picture)
   - Domain-specific signals worth weighting (industry tenure, certifications, language fluency, etc.)
4. User can answer in free text, or pick "skip — use smart default" on any question.
5. After enough information is gathered, the interviewer calls a tool `propose_scoring_persona` which returns:
   - `persona_text: string` — the full scoring persona, inheriting the global default's structure (rubric, anti-bias framing, tool-only output requirement) and customizing the role-specific guidance
   - `summary: string` — a one-paragraph rationale for the choices made (shown to the user for confidence-building)
6. User sees the proposed persona in a pre-filled textarea, can edit, then clicks **"Use for this JD"** which saves it to `scoring_persona_override` on the JD row.

**Files to create when implemented:**
- `lib/anthropic/prompts/persona-interview.ts` — the interviewer's system prompt (questions list, conversation strategy, when to call the tool)
- `lib/anthropic/tools/propose_scoring_persona.ts` — zod schema + tool definition
- `app/api/jds/propose-prompt/route.ts` — SSE-streaming endpoint that handles multi-turn conversation (POST per turn, body includes message history)
- `components/jds/PromptInterview.client.tsx` — chat UI with input box, message bubbles, "Save persona" CTA at the end
- Wire into `app/(dashboard)/jds/jd-editor.client.tsx` next to the Advanced section

**Implementation notes:**
- Use Haiku 4.5 — conversational, low-stakes, ~$0.005-0.01 per full interview
- Multi-turn: client sends `{ messages: [...] }` per turn; route handler appends the model's response and streams it back. Client manages the conversation array.
- Tool-use forcing only on the FINAL turn — when the model decides it has enough info, it calls `propose_scoring_persona`. Up to that point, free text (questions to the user).
- A safety net: cap conversations at ~10 turns. If the model hasn't called the tool by then, force the tool call with a directive.
- Persona generation references the GLOBAL active prompt as a structural template — the AI shouldn't reinvent the rubric/anti-bias framing, just customize the role-specific layer.

**Why Phase 4 / Day 4:**
- Depends on per-JD prompt override (✅ Phase 2, migration 0004)
- It's overdelivery — not in the rubric's 4 modules
- Pairs naturally with auto-email-reader (both are "AI helping the user set up the system")
- High UX-grade ROI (25% of the rubric) — reviewer sees the system *teaching* the user how to use it well

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
