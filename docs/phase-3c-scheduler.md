# Phase 3c — Scheduler basics + Settings/Integrations (one chat session)

Paste into a fresh Claude Code chat. Phase 3a (OAuth token persistence, commit `f725968`) and Phase 3b (Scraper, same commit) already shipped.

---

I'm continuing the Hotel Plus take-home (`acq.autopilotyourworkflow.com`). Phases 1, 2, 3a, 3b done. AGENTS.md is autoloaded — **trust it as the source of truth, do not re-read it for context.**

**Task this session:** Module 4 (Scheduler basics) + `/settings/integrations` page. Single-attendee Google Calendar event creation with Meet, description pre-filled from latest `scores.prep_questions`. Multi-party FreeBusy is Phase 4 — do NOT build it.

**Pre-decided contracts (do not deliberate):**
- Use the official `googleapis` SDK (`npm install googleapis`). Pre-built calendar client + types, less bespoke code than hand-rolling `fetch`.
- All Google API calls authenticate via `getGoogleAccessToken(userId)` from `lib/google/oauth.ts` (already built in Phase 3a). Signature: `Promise<{ ok: true; accessToken: string } | { ok: false; reason: 'not_connected' | 'revoked' | 'error'; message? }>`. When `ok: false` with `reason: 'not_connected'` → show "Connect Google Calendar" empty state with link to `/settings/integrations`. When `reason: 'revoked'` → same, plus a "Reconnect" toast.
- Event creation: `events.insert?conferenceDataVersion=1` with `conferenceData.createRequest` to auto-mint a Meet link.
- Description: auto-filled from the candidate's latest `scores.prep_questions` if exists, else empty.
- Persist to `interviews` table (schema already exists in 0001 init). Wrap the insert in `withAudit` (table: `'interviews'`, action: `'insert'`).
- Graceful degrade: email-OTP users (no Google) see a friendly empty state on `/schedule`, not a 500.

**New dependency:** `npm install googleapis`. That's it.

**Files to create:**

1. `lib/google/calendar.ts` — `createInterviewEvent({ userId, candidateName, candidateEmail?, startsAt, endsAt, prepQuestions, externalInvitees? })` → calls `events.insert` with `sendUpdates: 'all'`, returns `{ eventId, calendarId, meetUrl, description }`. Throws if user not connected.

2. `app/api/interviews/route.ts` — POST handler. Body: `{ candidateId, jdId?, stage, startsAt, endsAt, description?, externalInvitees?: string[] }`. Fetches candidate + latest score, calls `createInterviewEvent`, inserts `interviews` row via `withAudit`, returns `{ interviewId, meetUrl }`.

3. `app/(dashboard)/schedule/page.tsx` — server component. Fetches candidates + latest scores + connection status (`SELECT 1 FROM oauth_tokens WHERE user_id = auth.uid()`). If not connected → render the "Connect Google Calendar" empty state. Else → render the scheduling shell.

4. `app/(dashboard)/schedule/schedule-shell.client.tsx` — form: candidate picker, datetime pickers (use plain `<input type="datetime-local">`), optional external invitee emails (comma-separated). Submit → POST `/api/interviews` → toast with the Meet link.

5. `app/(dashboard)/schedule/loading.tsx`

6. `app/(dashboard)/settings/integrations/page.tsx` — server component. Shows three status rows: Calendar, Gmail Compose, Gmail Send. Each reads from `oauth_tokens.scopes[]` — green check if present, "Not granted" if not. For email-OTP users with no row at all: full "Connect Google" CTA → links to `/login` with a note "sign out + sign back in with Google to grant".

7. `app/(dashboard)/settings/integrations/loading.tsx`

**Files to modify:**

- `app/(dashboard)/settings/page.tsx` — flip the Integrations row's `ready: false` to `true` so it becomes a clickable card.

**Out of scope this session (do NOT build):**
- Multi-party FreeBusy slot finder (Phase 4)
- Calendar push channel / webhook for cancellation sync (Phase 4 or 5)
- Gmail draft creation (Phase 4 — cold-email pipeline)
- Proxycurl API key field on integrations page (Phase 5 — needed only if Phase-5 Scraper Third-party tab gets built)
- Reschedule / cancel flow (Phase 4)

**Smoke test (before committing):**
- Sign in with Google (your account, on test users list)
- Score a candidate so they have at least one `scores.prep_questions` array
- Go to `/schedule` → pick that candidate → set startsAt = 30 mins from now, endsAt = 60 mins from now → submit
- Confirm the Google Calendar event appears in YOUR calendar with: Meet link, description containing the prep questions
- `/settings/integrations` shows green checks for all 3 scopes
- Sign out, sign in via email OTP → `/schedule` shows the "Connect Google" empty state, doesn't 500

**Don't read:**
- `lib/google/oauth.ts` — Phase 3a built it; AGENTS.md has the signature `getGoogleAccessToken(userId): Promise<string | null>`
- `lib/audit/wrap.ts` — `withAudit` signature in AGENTS.md
- `cowork-log.md` — only when writing a new entry

**Cowork-log:** ONE entry on the design call that matters: graceful degrade for email-OTP users (the integrations page is the source of truth; features hide themselves when scope is missing rather than 500'ing). Under today's `*Day 3 cont. — <date>*` marker.

**First action:** confirm `googleapis` install, confirm your test-user account on the OAuth client. Then build straight through.

**Last action (mandatory):** before declaring the session complete, emit the **Session-done report** described in `AGENTS.md → Session-done reporting`. List files created, files modified, smoke tests passed, smoke tests Ben needs to run, anything deliberately deferred, the cowork-log entry you added. Then STOP — do not commit until Ben signs off.
