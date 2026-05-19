# Phase 3c — Pre-flight verify (3a + 3b) + Scheduler + Settings/Integrations

Paste into a fresh Claude Code chat. Phase 3a (OAuth, commit `f725968`) and Phase 3b (Scraper, same commit) were shipped by a previous session that ran out of context — they may have bugs from the rush. **Step 0 verifies them; Steps 1-3 build new work.**

---

I'm continuing the Hotel Plus take-home (`acq.autopilotyourworkflow.com`). Phases 1, 2, 3a, 3b done. AGENTS.md is autoloaded — **trust it as the source of truth, do not re-read it for context.**

## Step 0 — Verify 3a (OAuth) + 3b (Scraper) before building

I (Ben) will run each check below in the browser / Supabase SQL editor. Tell me to start. If a check fails, I'll paste the error/observation here, then we diagnose and fix in this same chat before moving to Step 1.

**Verification checklist (Ben runs these, reports back):**

1. **OAuth row populated.** After signing out + signing in with Google, Supabase SQL:
   ```sql
   SELECT user_id, scopes, octet_length(refresh_token_encrypted), expires_at FROM oauth_tokens;
   ```
   Expected: 1 row, octet_length ~70-100, `scopes` includes `calendar.events`, `calendar.freebusy`, `gmail.compose`, `gmail.send`.
2. **Scraper Paste tab works end-to-end.** `/scraper` → Paste tab → paste any plain-text CV → Extract → editable preview shows name/email/skills/etc → edit a field → Save → candidate appears in `/tracker`.
3. **Scraper URL tab works.** Paste a public URL → Extract → preview appears (LinkedIn URLs may 401 from server fetch — that's expected; try a Wikipedia bio or other accessible page).
4. **Scraper PDF tab works.** Upload a CV PDF → Extract → preview populates from cached `parsed_text`.

**Where the bugs would live if a check fails (do NOT pre-read — only open when investigating a specific failure):**
- Check 1 failure → `app/auth/callback/route.ts` (the upsert call) or `lib/google/oauth.ts` (`upsertOAuthTokens`)
- Check 2 failure → `app/api/scrape/paste/route.ts` + `lib/scrape/normalize.ts` + `app/(dashboard)/scraper/scraper-shell.client.tsx`
- Check 3 failure → `app/api/scrape/url/route.ts` (likely cheerio extraction or fetch headers)
- Check 4 failure → `app/api/scrape/pdf/route.ts` (likely the `attachmentId` lookup or `parsed_text` fetch)

**Repair rules:**
- Fix in place. Don't rewrite — these are real implementations, just possibly rough at edges.
- After each fix, re-run the failing check before moving on.
- Add a brief cowork-log entry under `*Day 3 cont. — <today's date in Bangkok>*` describing the fix (one entry per real bug, not one per typo).

Once ALL four checks pass, move to Step 1.

---

## Step 1 — Module 4 (Scheduler basics)

Single-attendee Google Calendar event with Meet link, description pre-filled from latest `scores.prep_questions`. Multi-party FreeBusy is Phase 4 — do NOT build it.

**Pre-decided contracts (do not deliberate):**
- Use the `googleapis` SDK (`npm install googleapis`). Pre-built calendar client + types, less bespoke than hand-rolling fetch.
- All Google API calls authenticate via `getGoogleAccessToken(userId)` from `lib/google/oauth.ts`. Returns `{ ok: true; accessToken } | { ok: false; reason: 'not_connected' | 'revoked' | 'error'; message? }`. On `not_connected` → show "Connect Google" empty state with link to `/settings/integrations`. On `revoked` → same plus a "Reconnect" toast.
- Event creation: `events.insert?conferenceDataVersion=1` with `conferenceData.createRequest` to auto-mint Meet link.
- Description: auto-filled from candidate's latest `scores.prep_questions` if exists, else empty.
- Persist to `interviews` table (schema in 0001). Wrap the insert in `withAudit` (`table: 'interviews'`, `action: 'insert'`).
- Graceful degrade: email-OTP users (no Google) see a friendly empty state, not a 500.

**Files to create:**

1. `lib/google/calendar.ts` — `createInterviewEvent({ userId, candidateName, candidateEmail?, startsAt, endsAt, prepQuestions, externalInvitees? })` → calls `events.insert` with `sendUpdates: 'all'`, returns `{ eventId, calendarId, meetUrl, description }`. Throws if user not connected.
2. `app/api/interviews/route.ts` — POST. Body: `{ candidateId, jdId?, stage, startsAt, endsAt, description?, externalInvitees?: string[] }`. Fetches candidate + latest score, calls `createInterviewEvent`, inserts `interviews` row via `withAudit`, returns `{ interviewId, meetUrl }`.
3. `app/(dashboard)/schedule/page.tsx` — server component. Fetches candidates + latest scores + connection status. Not connected → render "Connect Google Calendar" empty state. Else → schedule shell.
4. `app/(dashboard)/schedule/schedule-shell.client.tsx` — form: candidate picker, `<input type="datetime-local">` pickers, optional external invitee emails. Submit → POST `/api/interviews` → toast with Meet link.
5. `app/(dashboard)/schedule/loading.tsx`

## Step 2 — `/settings/integrations`

6. `app/(dashboard)/settings/integrations/page.tsx` — server component. Three status rows: Calendar, Gmail Compose, Gmail Send. Each reads from `oauth_tokens.scopes[]` → green check if present, "Not granted" if not. Email-OTP users with no row → full "Connect Google" CTA with note "sign out + sign back in with Google".
7. `app/(dashboard)/settings/integrations/loading.tsx`

**Files to modify:**
- `app/(dashboard)/settings/page.tsx` — flip Integrations row's `ready: false` → `true`.

**Out of scope this session (do NOT build):**
- Multi-party FreeBusy (Phase 4)
- Calendar webhook for cancel sync (Phase 4/5)
- Gmail draft creation (Phase 4)
- Proxycurl key field on integrations (Phase 5)
- Reschedule / cancel flow (Phase 4)

**Step 1+2 smoke tests (Ben runs after you build):**
- Score a candidate (any model). Go to `/schedule` → pick that candidate → startsAt = now+30min, endsAt = now+60min → submit
- Google Calendar event appears in Ben's calendar with: Meet link, description containing the prep questions
- `/settings/integrations` shows green checks on all 3 scopes
- Sign out → sign in via email OTP → `/schedule` shows "Connect Google" empty state, no 500

---

**Don't read** (and don't spawn Explore agents for these):
- `lib/google/oauth.ts` — signature in AGENTS.md
- `lib/audit/wrap.ts` — signature in AGENTS.md
- `cowork-log.md` — only when writing a new entry, and only the last 2-3 entries to match voice
- Any of the existing Scraper files unless a Step-0 check failed and points you there

**Cowork-log:** ONE entry covering the design call that matters: graceful degrade for email-OTP users (the integrations page is the source of truth; features hide themselves when scope is missing rather than 500'ing). Plus separate entries per real bug fixed in Step 0 (if any).

**First action:** ask me to start running the Step 0 checks. I'll paste results as I go. Don't propose architecture, don't read files — just wait for my report. Once Step 0 passes, install `googleapis` and build straight through.

**Last action (mandatory):** before declaring the session complete, emit the **Session-done report** described in `AGENTS.md → Session-done reporting`. List files created, files modified, smoke tests passed, smoke tests Ben needs to run, anything deferred, the cowork-log entries added. Then STOP — do not commit until Ben signs off.
