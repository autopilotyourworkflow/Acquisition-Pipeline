# Phase 4b — Cold-email drafter

I'm continuing the Hotel Plus take-home. Phases 1, 2, 3 done. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/anthropic/client.ts`, `lib/google/oauth.ts`, or `lib/google/calendar.ts` for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for codebase shape.
- Don't deliberate on the contracts below.
- Don't ship without Gmail-not-connected graceful degrade.

## Goal
On a candidate's detail page (and on the score card), surface a "Draft outreach email" button. Click → Claude writes a personalized first-touch email referencing the candidate's strengths and the JD → saves as a Gmail draft via the `gmail.compose` scope. User reviews in Gmail before sending.

## Pre-decided contracts
- **Model:** `claude-opus-4-7`. Email quality matters more than cost. ~$0.02-0.05 per draft.
- **Scope:** `https://www.googleapis.com/auth/gmail.compose` (already in our bundled OAuth request — verify in `/settings/integrations` shows "granted").
- **Auth degrade pattern:** if Gmail scope missing, the button is disabled with a tooltip pointing to `/settings/integrations`. Same pattern Scheduler uses for `calendar.events`.
- **Audit:** wrap the draft creation in `withAudit({ action: 'insert', table: 'gmail_drafts' })` so the activity log captures who drafted what. New `gmail_drafts` table (migration 0007) with `id, org_id, candidate_id, score_id, gmail_draft_id, gmail_thread_id, subject, body, status, created_by, created_at`.
- **Prompt structure:** system prompt locks tone (warm, professional, Hotel Plus voice — friendly but not casual). User message gives Claude: candidate name, current title, top 3 strengths from latest score, JD title + summary, sender's display name. Tool-use forced: `submit_email_draft({ subject, html_body, plain_body })`.
- **Public-artifact rule** (per cowork-log #33): if the email contains anything sensitive (scoring rationale, internal notes), DON'T embed it — link to a staff-only `/candidates/<id>/email-context` page instead. For the first cut, just stick to candidate-facing content; no staff-only context needed.

## Files to create
1. `supabase/migrations/0007_gmail_drafts.sql` — `gmail_drafts` table with RLS (org-scoped).
2. `lib/google/gmail.ts` — `createDraft({ userId, to, subject, htmlBody, plainBody })` → calls `gmail.users.drafts.create` with MIME-encoded message. Returns `{ draftId, threadId, draftUrl }` where draftUrl is the Gmail web UI link `https://mail.google.com/mail/u/0/#drafts/<id>`.
3. `lib/anthropic/prompts/cold-email.v1.ts` — system + user template builders. Same shape as `scoring.v1.ts`.
4. `lib/anthropic/tools/submit_email_draft.ts` — zod tool def: `{ subject, html_body, plain_body }`.
5. `app/api/emails/draft/route.ts` — POST `{ candidateId, scoreId }`. Fetches candidate + JD + score, calls Claude with `callWithTool`, then `createDraft`, then inserts via `withAudit`. Returns `{ draftId, draftUrl }`. Returns 409 with `reason: 'not_connected'` if Gmail scope missing.
6. `components/candidates/DraftEmailButton.client.tsx` — button + handler. POSTs to the API, toasts with the Gmail draft URL on success.
7. Wire button into `app/(dashboard)/candidates/[id]/page.tsx` (top of page, near other actions) and `components/screener/ScoreCard.tsx` (alongside other CTAs).

## Out of scope (do NOT build)
- Sending the email (`gmail.send` scope exists, but DRAFTING is the deliverable; sending happens in Gmail)
- Email templates picker / editing UI
- Threading / reply tracking
- Auto-personalization beyond the candidate's score data
- Multi-candidate batch drafting

## Smoke tests
- [ ] Apply migration `0007_gmail_drafts.sql` in Supabase SQL editor
- [ ] On a scored candidate's detail page, click "Draft email" → toast "Draft created" with Gmail link
- [ ] Open the draft in Gmail → subject + body are populated, content references candidate's strengths + JD title
- [ ] Activity log on `/activity` shows the draft insert
- [ ] Sign in via email OTP (no Google) → button is disabled with tooltip linking to `/settings/integrations`
- [ ] `gmail_drafts` table has the row with `gmail_draft_id` populated

## First action
Confirm with Ben:
1. Opus 4.7 for quality (~$0.05/draft) — OK?
2. Email tone preference — default "warm professional, Hotel Plus voice" or something specific?

Then build straight through.

## Last action (mandatory)
Emit the **Session-done report** described in `AGENTS.md → Session-done reporting`. Then STOP.
