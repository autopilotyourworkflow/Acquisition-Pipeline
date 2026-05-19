# Phase 4 — overdelivery menu

Phases 1, 2, 3 are done. Phase 4 is the "overdelivery" pass — items beyond the rubric's required four modules. Six potential items, three sessions' worth of work. Pick what to do and in what order.

## Status table

| Module | Status | Prompt | Why prioritize |
|---|---|---|---|
| 4a — AI prompt-builder interview | not started | [phase-4a-prompt-builder.md](phase-4a-prompt-builder.md) | High rubric ROI — the system teaches users how to use it. Most demo-able overdelivery. |
| 4b — Cold-email drafter | not started | [phase-4b-cold-email.md](phase-4b-cold-email.md) | Visible action on the data. Pairs naturally with 4a in a demo. |
| 4c — Auto-email-reader | not started | (write when ready) | Most engineering, least demo-able (runs in background via Vercel Cron). |
| 4d — Multi-party FreeBusy | not started | (write when ready) | Calendar polish — finds a slot N attendees are all free. |
| 4e — Undo/redo conflict UX | not started | (write when ready) | Polishes the existing audit/undo backbone. Small. |
| 4f — Interview invitees richer flow | not started | (write when ready) | Per-invitee response tracking on the interview detail page. |

## Recommended order

**For the strongest demo arc**: 4a → 4b. The prompt-builder shows the system being smart about its own configuration; cold email shows it taking visible action on the data. Both fit in 4-5 hours combined. A reviewer scanning the app sees AI doing real work in two new ways.

**For systems-engineering grade**: 4c (auto-email-reader) is the most "real product" item — Gmail polling, Vercel Cron, auto-create + auto-score. Looks small in the UI but represents the heaviest backend work in the project.

**For polish-only sessions** (if time is short): 4e (undo/redo conflict) and 4f (invitee tracking) extend existing modules without new architecture.

## Cross-cutting reminders for Phase 4

- Every Google API call goes through `getGoogleAccessToken(userId)` from `lib/google/oauth.ts`. Returns `{ ok: true; accessToken } | { ok: false; reason }`. Map `not_connected` / `revoked` to the same empty state pattern the Scheduler uses.
- Every mutation goes through `withAudit()` for the activity log.
- Public-artifact-with-private-context pattern (see cowork-log #33): when something ships out of our app (calendar invite, email), link to an auth-gated page rather than embedding private content directly.
- Anti-pattern dump for handoff prompts and the file-read-don'ts is in AGENTS.md — every Phase 4 prompt assumes that's autoloaded.

## After Phase 4

Phase 5 = browser extension + polish + demo prep + the env-var health-check banner on `/settings/integrations` (memory: `phase_5_env_health_check.md`).
Phase 6 = final secrets audit + handoff prep (reviewer Google Cloud test users, secrets rotation, README).
