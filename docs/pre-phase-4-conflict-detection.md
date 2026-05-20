# Pre-Phase 4 — Scheduling conflict detection

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home (`acq.autopilotyourworkflow.com`). Phases 1, 2, 3 done. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/google/oauth.ts`, `lib/google/calendar.ts`, or any existing files for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for "what does this codebase look like" questions.
- Don't audit directory structure — AGENTS.md has the inventory.
- Don't deliberate on the contracts below — they're locked.

## Goal
Finish Module 4 (Scheduler) by adding the conflict-detection requirement from the original assignment ("แจ้งเตือนเมื่อมีการนัดซ้อนกัน"). When the user picks a time on `/schedule/new`, hit Google's `freebusy.query` API for their primary calendar and show an inline warning if the proposed window overlaps any busy interval.

## Pre-decided contracts
- **Warn-only, no block.** Inline warning under the time pickers if conflict found. Submit stays enabled — HR may legitimately want to book during a buffer block.
- **Booker's calendar only.** The signed-in user's primary. Multi-attendee FreeBusy is Phase 5 (deferred). Don't query external invitee calendars — most will refuse to share freebusy data anyway.
- **Debounce ~400ms** after both `startsAt` and `endsAt` have values. Don't fire on every keystroke.
- **Auth-degrade silently.** If `getGoogleAccessToken` returns `not_connected` or `revoked`, the conflict check just returns `{ conflicts: [] }`. The form already handles the empty-state path — don't surface a "Google not connected" warning from the conflict checker.
- **Read-only.** No `withAudit` wrap (read-only Calendar query, no DB mutation).

## Files to create
1. `lib/google/calendar.ts` — add a function:
   ```ts
   checkBusy({ userId, startsAt, endsAt }: { userId: string; startsAt: string; endsAt: string })
     => Promise<{ conflicts: Array<{ start: string; end: string; summary?: string }> }>
   ```
   - Calls `calendar.freebusy.query` with `items: [{ id: 'primary' }]`, `timeMin: startsAt`, `timeMax: endsAt`.
   - Filters returned busy intervals to those overlapping the proposed window (any overlap, not just full containment).
   - The `summary` field is best-effort — `freebusy.query` doesn't return event titles. If you want titles, list events instead (`events.list?timeMin&timeMax&singleEvents=true`) — only do that if it's cheap, otherwise skip the title.
   - On `not_connected` / `revoked` from `getGoogleAccessToken`, return `{ conflicts: [] }` without throwing.
2. `app/api/schedule/conflicts/route.ts` — POST endpoint.
   - Body: `{ startsAt: string; endsAt: string }` (ISO strings).
   - Auth: `createClient()` → require user.
   - Calls `checkBusy({ userId, startsAt, endsAt })`.
   - Returns `{ conflicts: [...] }`. Returns `{ conflicts: [] }` on auth degrade.

## Files to modify
3. `app/(dashboard)/schedule/new/schedule-form.client.tsx` — the booking form.
   - Add a `useEffect` that debounces 400ms after `startsAt` and `endsAt` both have values, POSTs to `/api/schedule/conflicts`, stores `conflicts` in component state.
   - Render a warning block under the time pickers when `conflicts.length > 0`:
     - Visual: terracotta-tinted card (use the project's existing alert/warning styles — check `components/ui/` for what's already there; if nothing, just use brand tokens inline).
     - Copy: "⚠ Conflict on your calendar: <start>–<end>" per conflict. If summary available: "⚠ Conflict: <summary> (<start>–<end>)".
   - Hide the warning if user changes either field (until next debounce-tick).
   - Submit button stays enabled regardless.

## Out of scope (do NOT build)
- Multi-attendee FreeBusy (Phase 5)
- Suggested-times picker
- Conflict-checking against external invitee calendars
- Warning on reschedule (Phase 5; this is the create-flow only)
- Auto-shifting the proposed time to dodge the conflict

## Smoke tests
- [ ] Block a 30-min slot in Google Calendar at +1 hr from now. Open `/schedule/new`, pick a candidate, set startsAt = +1hr, endsAt = +1.5hr → warning appears within ~1s.
- [ ] Pick a window with no conflict → no warning.
- [ ] Sign in via email OTP (no Google) → form works, no warning, no crash, no spurious "connect Google" message.
- [ ] Type rapidly in the start picker (change value 5 times in 2s) → only one API call fires (verify in Network tab).
- [ ] Submit despite a warning → interview is created normally (warn doesn't block).

## Cowork-log entry (ONE entry)
Topic: choosing "warn but don't block" over hard-block. The reasoning: HR's calendar isn't a single source of truth for HR's time — buffer blocks, focus blocks, "tentative" events all show as busy. A rigid block would create friction every time. A warning informs the user without dictating to them. Match Day 4 voice (you'll be writing under `*Day 4 — <today's date in Bangkok>*` if no Day 4 entries exist yet).

## First action
Run the four smoke tests' setup checks (does Beam have any blocked calendar events right now? does email-OTP signin exist?) — actually no, just confirm with Beam that he's ready to run the smoke tests after the build, then build straight through.

## Last action (mandatory)
Emit the **Session-done report** described in AGENTS.md → Session-done reporting. Then STOP.
