# Phase 3 handoff — paste this into a new Claude Code chat to start Day 3

Picking up the build of a recruiting tool I'm shipping as a 5-day take-home for **Hotel Plus** (hotelplus.asia). Phases 1 and 2 are live at https://acq.autopilotyourworkflow.com.

## Read these in order before touching code

1. **AGENTS.md** (repo root) — locked decisions, file structure, conventions, phase-progress table, cowork-log voice rules. Re-read explicitly so it's fresh in this session.
2. **cowork-log.md** (repo root) — 25 narrative entries on every decision so far. Match the voice when you append new ones.
3. **MEMORY.md** auto-loads from `C:\Users\chano\.claude\projects\e--BEAM-Work-Antigravity-Workspaces-Resume-Screener\memory\` — user profile, function-before-form preference, Final Phase reminders.
4. **The approved plan**: `C:\Users\chano\.claude\plans\let-s-start-planning-addition-prancy-glade.md` — the original Day-by-day plan (Phases 1-2 are now done + some Phase 3-5 work was pulled forward; see the AGENTS.md status table).

## Status going in

**Phase 1** ✅ deployed at `acq.autopilotyourworkflow.com`. Migrations 0001-0004 applied. Auth (Google OAuth + email OTP) verified end-to-end.

**Phase 2** ✅ complete. Built:
- Foundation: `lib/audit/wrap.ts:withAudit()` HOF + `lib/anthropic/client.ts` (retry / cache / telemetry / tool-use forcing) + `lib/anthropic/tools/submit_score.ts` + `lib/anthropic/prompts/scoring.v1.ts`
- Module 3 — Tracker: Kanban + Table (Table is default, on the left), JD CRUD, optimistic drag-drop with **UndoToast** action button, latest-score color badges on cards/rows, click-through to candidate detail
- Module 2 — Screener: SSE-streaming `/api/score/run`, ScoreCard with animated bars, PDF upload via `unpdf` + sha256 **dedup**, model picker (Haiku 4.5 default, Opus 4.7 escalation), **scoring teams** (3 parallel scorers at temps 0/0.3/0.6 + manager consolidation), score history per (candidate, JD) inline
- `/activity` page with **any-age Undo** (basic — Day-4 will add conflict detection)
- `/settings/prompts` — editable scoring prompts with auto-version-bump
- Per-JD `scoring_persona_override` (migration 0004)
- `/candidates/[id]` detail page (contact + attachments + scoring history grouped by JD)
- Bundled Calendar + Gmail OAuth scopes at sign-in (refresh token granted, **not yet persisted** — that's Phase 3)
- `loading.tsx` skeletons for every route
- 25 cowork-log entries

**Anthropic credit** is loaded. Smoke-tested Haiku scoring at ~$0.009 / 15s per run.

## Phase 3 goal

Day 3 of the plan: **Module 1 (Scraper)** and **Module 4 (Scheduler basics)**.

## Order of work

**Step 0 — Persist the Google OAuth tokens (prereq for Module 4).**

We bundled the scopes at sign-in (Phase 2 entry #17) but we never wrote the `provider_refresh_token` from the Supabase session to our `oauth_tokens` table. Without that, the Calendar/Gmail API calls in Module 4 + Phase 4 have nothing to authenticate with after the 1-hour `provider_token` expires.

- Update `app/auth/callback/route.ts` to extract `session.provider_token` + `session.provider_refresh_token` from `exchangeCodeForSession`, encrypt the refresh token via Node-side AES-GCM using `OAUTH_ENCRYPTION_SECRET`, and upsert into `oauth_tokens`. Schema already supports this (`refresh_token_encrypted bytea NOT NULL`).
- Generate `OAUTH_ENCRYPTION_SECRET` (32 random bytes, hex-encoded). Add to `.env.local` AND to Vercel env vars before deploying anything that uses it.
- Build `lib/google/oauth.ts:getGoogleAccessToken(userId)` — returns a fresh access token, refreshing via the stored refresh token if expired. Handles the "user hasn't connected Google" case (email-OTP signups) by returning `null`.

If `OAUTH_ENCRYPTION_SECRET` setup feels heavy, the alternative is `pgcrypto.pgp_sym_encrypt()` with a Postgres-level secret — but the schema currently expects Node-side encryption, and the rationale was documented in cowork-log entry #6 (security smell: keys + ciphertext in the same system).

**Step 1 — Module 1 (Scraper). This is where most of the time goes.**

`app/(dashboard)/scraper/page.tsx` — tabbed UI. Five tabs:
- **URL** — paste a public LinkedIn / JobsDB URL. Server fetches HTML, cheerio extracts the profile section, Haiku normalizes to the `extract_candidate` tool's shape.
- **Paste** — paste raw resume text. Haiku normalizes.
- **PDF** — reuse the existing `/api/attachments/upload` route. Haiku normalizes the cached `parsed_text` AFTER upload.
- **Screenshot** — upload a profile screenshot. Supabase Storage `screenshots` bucket. Opus 4.7 with image content block + the `extract_candidate` tool.
- **Third-party API** — user pastes a Proxycurl API key in `/settings/integrations` (build that page in this phase). Server calls Proxycurl, Haiku flattens the result to our schema.

All five funnel through `lib/scrape/normalize.ts:normalizeAndPreview()` which returns the candidate JSON. The UI shows an **editable preview** — every field is a text input the user can edit before clicking Save. Save creates the candidate via the existing `createCandidate` Server Action, with `source` set to one of `linkedin / jobsdb / paste / pdf / screenshot / thirdparty_api`.

Tool schema (`lib/anthropic/tools/extract_candidate.ts`) was already written in Phase 2 — review it and tighten if needed.

New deps: `cheerio`.

**Step 2 — Module 4 (Scheduler basics).**

Single-attendee event creation. `app/(dashboard)/schedule/page.tsx` — pick a candidate, pick a date/time, optionally add external invitees by email. POST `/api/interviews` → `lib/google/calendar.ts` creates the event with `conferenceData.createRequest` (auto-mints a Meet link) and pre-fills the description from the candidate's latest `scores.prep_questions`.

Graceful degrade: if the user hasn't connected Google (email-OTP signup or revoked Calendar scope), `/schedule` shows a "Connect Google Calendar to schedule interviews" empty state with a deep link to `/settings/integrations`.

Persist interview rows in `interviews` table (already in schema). Wrap every mutation in `withAudit`.

**Step 3 — Settings → Integrations page (`/settings/integrations`).**

Show three rows: Google Calendar (read), Google Calendar (write), Gmail (compose). Since we bundled all scopes at sign-in, all three should show as "Connected" for Google-OAuth users — just need to check the stored `oauth_tokens.scopes[]` array. Email-OTP users see "Not connected — sign in with Google to enable" with a link to `/login`.

Also add a Proxycurl API key field (optional, BYO-key for third-party scraping).

## Hard rules (carried over)

- Every mutation → `withAudit()`. No exceptions.
- Every Claude call → `lib/anthropic/client.ts`. No direct `@anthropic-ai/sdk` imports in feature code.
- Tool-use forcing for structured output (`extract_candidate` for Scraper, etc.).
- **Function before form.** Day-5 polish pass is the visual cleanup pass. Don't pause feature work to nudge pixels.
- **Explain the WHY** for non-obvious calls — Ben is a vibe coder building the product, not just shipping it.
- Never echo secret values back in chat. Use `.env.local` (gitignored) + Vercel env vars.
- Service-role Supabase client (`lib/supabase/admin.ts`) is server-only — never import from `'use client'`.

## Cowork-log convention

Today's date in Bangkok (Asia/Bangkok) is the marker. Use `*Day 3 — YYYY-MM-DD*` once before the first entry. Match the existing 25 entries' voice: first-person, framing-question → tradeoffs → decision → bolded takeaway, ~150-300 words each. Skip the date marker if entries continue on the same calendar day; add a `*Day 3 cont. — YYYY-MM-DD*` for cross-day continuations.

Append an entry after each meaningful decision — the OAuth-token-storage approach, any Scraper-tab UX call, the editable-preview ergonomics, the Calendar API design call.

## First action

Confirm you've read AGENTS.md and cowork-log.md by paraphrasing one decision from each — that proves they actually loaded, not just got skimmed.

Then propose the **OAuth token storage approach** before coding it. Specifically: encryption-at-rest strategy (Node AES-GCM vs pgcrypto vs deferred?), how `lib/google/oauth.ts:getGoogleAccessToken` handles the refresh-token rotation race, what happens when a user explicitly revokes Google access from Google's side. Lock the contract first.

Once I sign off, build the foundation (Step 0), then the Scraper module (Step 1), then Scheduler basics (Step 2), then the Integrations settings (Step 3).

Let's go.
