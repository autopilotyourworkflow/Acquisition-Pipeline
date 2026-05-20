# Phase 4 — overdelivery pass (status index)

Phases 1, 2, 3 are done. Phase 4 is the "overdelivery" pass — items beyond the rubric's required four modules. Originally six potential items; planned cut: build 4a + 4b + 4c, defer 4d/4e/4f to Phase 5 polish. A small finish-Phase-3 task (conflict detection) ships first.

## Status table

| Module | Status | Prompt | Why prioritize |
|---|---|---|---|
| Pre — Scheduling conflict detection | not started | [pre-phase-4-conflict-detection.md](pre-phase-4-conflict-detection.md) | Closes a rubric requirement (Module 4 explicitly asks for it). ~30 min of build. Do this first. |
| 4a — AI prompt-builder questionnaire | not started | [phase-4a-prompt-builder.md](phase-4a-prompt-builder.md) | High rubric ROI — the system teaches users how to configure it well. Most demo-able overdelivery. |
| 4b — Cold-email drafter (draft + send) | not started | [phase-4b-cold-email.md](phase-4b-cold-email.md) | Visible action on the candidate data. Pairs naturally with 4a in the demo. |
| 4c — Auto-email-reader (Gmail polling) | not started | [phase-4c-auto-reader.md](phase-4c-auto-reader.md) | "The product is alive" magic — Gmail polls for new resumes, auto-creates + auto-scores. Heaviest backend. |
| 4d — Multi-party FreeBusy | **deferred** | (write when ready) | Phase 5 polish. Pre-phase conflict detection covers the common case. |
| 4e — Undo/redo conflict UX | **deferred** | (Phase 5) | Small polish on existing audit/undo backbone. |
| 4f — Per-invitee response tracking | **deferred** | (Phase 5) | Small polish on interview detail page. |

## Recommended order

Pre → 4a → 4b → 4c. One Claude Code session per item. The pre-phase conflict-detection mini-session can probably squeeze in alongside 4a if context permits, but cleaner as its own commit.

**Demo arc the order produces:**
- Pre + 4d-deferred → "the calendar warns me about overlaps before I book."
- 4a → "I generated a tailored scoring persona for this JD by answering 5 questions."
- 4b → "I drafted (or sent) a personalized first-touch email to the top candidate in two clicks."
- 4c → "The inbox watched for new resumes and auto-scored them while I was away."

That's four distinct overdelivery beats on top of the four required modules.

## Cross-cutting reminders for Phase 4

- Every Google API call goes through `getGoogleAccessToken(userId)` from `lib/google/oauth.ts`. Returns `{ ok: true; accessToken } | { ok: false; reason }`. Map `not_connected` / `revoked` to the same empty-state pattern the Scheduler uses.
- Every mutation goes through `withAudit()` for the activity log.
- Public-artifact-with-private-context pattern (cowork-log #33): when something ships out of our app (calendar invite, email), link to an auth-gated page rather than embedding private content directly.
- Anti-pattern dump for handoff prompts (don't re-read X, don't audit directory structure, etc.) is in AGENTS.md — every Phase 4 prompt assumes that's autoloaded.

## After Phase 4

- **Phase 5** — Chrome MV3 extension, demo video, env-var health-check banner on `/settings/integrations` (memory: `phase_5_env_health_check.md`), plus the deferred 4d/4e/4f items if time allows.
- **Phase 6** — final secrets audit + handoff (reviewer Google Cloud test users, secrets rotation, README cleanup).
