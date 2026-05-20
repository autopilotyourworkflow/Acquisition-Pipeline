# Phase 4 — overdelivery pass (status index)

Phases 1, 2, 3, and Pre-Phase 4 are done. Two new outbound-flow modules (3d / 3e) ship *before* Phase 4 because they replace the standalone 4b cold-email plan with a JD-outward flow (source candidates → email them). Phase 4 then narrows to 4a + 4c.

## Status table

| Module | Status | Prompt | Why prioritize |
|---|---|---|---|
| Pre — Scheduling conflict detection | ✅ done | [pre-phase-4-conflict-detection.md](pre-phase-4-conflict-detection.md) | Closed a rubric requirement (Module 4 explicitly asks for it). |
| 3d — Outbound sourcing + JobsDB inbound | not started | [phase-3d-outbound-sourcing.md](phase-3d-outbound-sourcing.md) | Assignment brief explicitly calls out JobsDB candidate scraping. Outbound sourcing is the parent flow that makes cold email (3e) a natural consequence. |
| 3e — Cold email (review-before-send) | not started | [phase-3e-cold-email.md](phase-3e-cold-email.md) | **Replaces former 4b.** Once 3d sources candidates, the next-step CTA is "email them." Single-candidate review-before-send flow. |
| 4a — AI prompt-builder questionnaire | not started | [phase-4a-prompt-builder.md](phase-4a-prompt-builder.md) | High rubric ROI — the system teaches users how to configure it well. Most demo-able overdelivery. |
| 4b — Cold-email drafter | ✅ **replaced by 3e** | ~~[phase-4b-cold-email.md](phase-4b-cold-email.md)~~ (superseded) | Standalone draft-and-send UI absorbed into 3e's candidate-detail flow. |
| 4c — Auto-email-reader (Gmail polling) | not started | [phase-4c-auto-reader.md](phase-4c-auto-reader.md) | "The product is alive" magic — Gmail polls for new resumes, auto-creates + auto-scores. Heaviest backend. Migration shifts 0008 → 0009 because 3e takes 0008. |
| 4d — Multi-party FreeBusy | **deferred** | (write when ready) | Phase 5 polish. Pre-phase conflict detection covers the common case. |
| 4e — Undo/redo conflict UX | **deferred** | (Phase 5) | Small polish on existing audit/undo backbone. |
| 4f — Per-invitee response tracking | **deferred** | (Phase 5) | Small polish on interview detail page. |

## Recommended order

3d → 3e → 4a → 4c. One Claude Code session per item. (Pre-phase conflict detection already done.)

**Demo arc the order produces:**
- Pre + 4d-deferred → "the calendar warns me about overlaps before I book."
- 3d → "I clicked one button and the system found 20 candidates on LinkedIn/JobsDB matching this JD, then scored them."
- 3e → "From the top candidate's detail page, I clicked Compose, edited the AI-drafted email, and sent it via Gmail."
- 4a → "I generated a tailored scoring persona for this JD by answering 5 questions."
- 4c → "The inbox watched for new resumes and auto-scored them while I was away."

That's five distinct overdelivery beats on top of the four required modules.

## Cross-cutting reminders for Phase 4

- Every Google API call goes through `getGoogleAccessToken(userId)` from `lib/google/oauth.ts`. Returns `{ ok: true; accessToken } | { ok: false; reason }`. Map `not_connected` / `revoked` to the same empty-state pattern the Scheduler uses.
- Every mutation goes through `withAudit()` for the activity log.
- Public-artifact-with-private-context pattern (cowork-log #33): when something ships out of our app (calendar invite, email), link to an auth-gated page rather than embedding private content directly.
- Anti-pattern dump for handoff prompts (don't re-read X, don't audit directory structure, etc.) is in AGENTS.md — every Phase 4 prompt assumes that's autoloaded.

## After Phase 4

- **Phase 5** — Chrome MV3 extension, demo video, env-var health-check banner on `/settings/integrations` (memory: `phase_5_env_health_check.md`), plus the deferred 4d/4e/4f items if time allows.
- **Phase 6** — final secrets audit + handoff (reviewer Google Cloud test users, secrets rotation, README cleanup).
