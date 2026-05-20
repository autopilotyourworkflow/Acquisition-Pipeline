# Phase 4b — Cold-email drafter (draft + send + signature + confirm)

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home. Phases 1, 2, 3 done; pre-Phase-4 conflict detection and Phase 4a shipped. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/anthropic/client.ts`, `lib/google/oauth.ts`, or `lib/google/calendar.ts` for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for codebase shape.
- Don't audit directory structure — AGENTS.md has the inventory.
- Don't deliberate on the contracts below — they're locked.
- Don't ship without Gmail-not-connected graceful degrade.
- Don't add a "send without confirm" path — Send Now must always go through the confirm dialog.

## Goal
On a candidate's detail page (and the score card), surface **two buttons**:
1. **Draft email** → creates a Gmail draft → toast with the Gmail draft URL → user reviews + sends from Gmail.
2. **Send now** → opens a confirm dialog with the full email preview → on confirm, sends the email via `gmail.send` and shows a toast.

Both buttons append a user-configurable signature stored in `user_settings`. Default signature is seeded with a sensible Hotel Plus template on first save; user edits at `/settings`.

## Pre-decided contracts
- **Model:** `claude-opus-4-7`. Email quality matters more than cost. ~$0.02–0.05 per draft.
- **Scopes:** `gmail.compose` (for draft creation) and `gmail.send` (for the send-now path). Both are already in our bundled OAuth request — verify `/settings/integrations` shows both granted before the first attempt.
- **Auth degrade:** if either scope is missing, the respective button is disabled with a tooltip pointing to `/settings/integrations`. Same pattern Scheduler uses.
- **Signature lifecycle:**
  - New column `user_settings.cold_email_signature` (text). Default value: a sensible Hotel Plus template (see "Default signature" below).
  - First-load of `/settings` with no row yet → seed the default + show in an editable textarea.
  - Claude is told the signature exists and is appended verbatim — Claude does NOT generate the signature, only the body.
  - The signature is appended in the API route after Claude returns the body. Keeps Claude's output focused on the body and prevents Claude from "improving" the signature.
- **Send safeguard:** "Send now" never sends on first click. Always opens a confirm dialog showing:
  - Recipient (`to`)
  - Subject
  - Full body (rendered)
  - Signature (rendered, visually separated)
  - Two buttons: "Cancel" + "Send"
- **Audit:** wrap the draft creation in `withAudit({ action: 'insert', table: 'gmail_drafts' })`. Wrap the send in `withAudit({ action: 'send', table: 'gmail_drafts' })` (`action` is a free-text column — `'send'` is fine, no enum constraint). Records who sent what.
- **Tool-use forcing:** Claude returns `{ subject, html_body, plain_body }` via `submit_email_draft` tool. No free-form JSON parsing.
- **Public-artifact rule** (cowork-log #33): the email body contains only candidate-facing content (their strengths, the JD title, an invitation to chat). No scoring rationale, no internal notes. First-cut: stick to candidate-facing — no staff-only context page needed.

## Default signature

```
Best,
{user_display_name}
Hotel Plus
hotelplus.asia
```

(The route fills in `{user_display_name}` from the user's auth metadata or email-local-part if no display name.)

## Files to create
1. `supabase/migrations/0007_gmail_drafts.sql` —
   - `CREATE TABLE gmail_drafts` with: `id uuid pk`, `org_id uuid`, `candidate_id uuid`, `score_id uuid`, `gmail_draft_id text`, `gmail_thread_id text`, `gmail_message_id text` (populated on send), `subject text`, `body_html text`, `body_plain text`, `status text` (`'draft' | 'sent'`), `created_by uuid`, `created_at timestamptz`, `sent_at timestamptz`.
   - RLS: org-scoped reads, owner-or-self writes.
   - `ALTER TABLE user_settings ADD COLUMN cold_email_signature text;`
2. `lib/google/gmail.ts` —
   - `createDraft({ userId, to, subject, htmlBody, plainBody })` → `gmail.users.drafts.create` with MIME-encoded message. Returns `{ draftId, threadId, draftUrl }` where `draftUrl = 'https://mail.google.com/mail/u/0/#drafts/' + draftId`.
   - `sendDraft({ userId, draftId })` → `gmail.users.drafts.send`. Returns `{ messageId, threadId }`. (Sending an existing draft preserves the Gmail "saved" history.)
   - `sendNew({ userId, to, subject, htmlBody, plainBody })` → `gmail.users.messages.send` direct. Use this for the "Send now" path so we don't create-then-send the draft (saves a round trip).
3. `lib/anthropic/prompts/cold-email.v1.ts` —
   - Exports `buildColdEmailMessages({ candidate, jd, score, senderName })` → `{ system, messages }` for `callWithTool`.
   - System prompt: locks tone (warm, professional, Hotel Plus voice — friendly but not casual). Forbids buzzwords. Forbids generic openings ("I hope this email finds you well"). Caps body length ~180 words. Specifies the format: 1 sentence opener referencing a real strength from the score, 1–2 sentences on the role, 1 sentence on next step (15-min call).
   - User message: candidate name, current title, top 3 strengths from latest score, JD title + summary, sender's display name.
4. `lib/anthropic/tools/submit_email_draft.ts` — zod tool: `{ subject: z.string().min(5).max(120); html_body: z.string().min(50).max(4000); plain_body: z.string().min(50).max(4000) }`.
5. `app/api/emails/draft/route.ts` — POST `{ candidateId, scoreId }`. Fetches candidate + JD + score + signature from `user_settings`. Calls Claude. Appends signature to body. Calls `createDraft`. Inserts `gmail_drafts` row via `withAudit`. Returns `{ ok: true, data: { draftId, draftUrl, subject, bodyHtml, bodyPlain } }`. Returns 409 with `reason: 'not_connected'` if Gmail-compose scope missing.
6. `app/api/emails/send/route.ts` — POST `{ candidateId, scoreId, subject, bodyHtml, bodyPlain }`. Sends via `sendNew`, inserts/updates `gmail_drafts` row with `status='sent'` + `sent_at` + `gmail_message_id` via `withAudit`. Returns `{ ok: true, data: { messageId } }`. Returns 409 if Gmail-send scope missing.
7. `components/candidates/EmailActions.client.tsx` —
   - Two buttons: "Draft email" + "Send now".
   - **Draft email** flow: POST to `/api/emails/draft`, toast with link "Draft saved — open in Gmail" pointing to `draftUrl`.
   - **Send now** flow: POST to `/api/emails/draft` first (to get the AI-generated subject + body) → store in component state → open a `Dialog` showing the preview → on confirm, POST to `/api/emails/send` → toast "Sent to <recipient>". On cancel, leave the draft as-is in Gmail (already saved) and close the dialog.
   - Both buttons disabled with tooltip if Gmail scope missing. Pass `gmailConnected: boolean` as a prop from the server component parent.
8. Wire `EmailActions` into:
   - `app/(dashboard)/candidates/[id]/page.tsx` — near the top, in the actions bar.
   - `components/screener/ScoreCard.tsx` — alongside other CTAs.
9. `/settings` page (`app/(dashboard)/settings/page.tsx`) — add a "Cold-email signature" section:
   - Editable textarea bound to `user_settings.cold_email_signature`.
   - Server action `saveColdEmailSignature({ signature })` that upserts the row via `withAudit({ table: 'user_settings', action: 'update' })`.
   - First-load with no value: seed the default and show it pre-filled.

## Out of scope (do NOT build)
- Threading / reply tracking
- Multi-candidate batch drafting
- Email templates picker UI
- Auto-personalization beyond the candidate's score data
- A/B testing different tones
- Tracking opens / clicks
- Streaming Claude's response token-by-token in the UI

## Smoke tests
- [ ] Apply migration `0007_gmail_drafts.sql` in Supabase SQL editor
- [ ] Visit `/settings` → "Cold-email signature" section shows the default Hotel Plus template; edit and save → toast confirms
- [ ] On a scored candidate's detail page, click "Draft email" → toast appears with Gmail draft URL
- [ ] Open the draft in Gmail → subject populated, body references candidate's strengths + JD title, signature appended verbatim
- [ ] Click "Send now" → confirm dialog opens with full preview (subject, recipient, body, signature)
- [ ] Cancel → no send, dialog closes
- [ ] Send → toast "Sent to <email>" → check Gmail "Sent" folder → message present
- [ ] Activity log on `/activity` shows both the draft insert and the send
- [ ] Sign in via email OTP (no Google) → both buttons disabled with tooltip
- [ ] `gmail_drafts` table has one `draft` row (after draft) and one `sent` row (after send) — verify via SQL

## First action
Confirm with Ben:
1. Opus 4.7 for quality (~$0.05/draft) — OK?
2. Default signature template (above) — OK, or want a different one?

Then build straight through.

## Last action (mandatory)
Emit the **Session-done report** described in AGENTS.md → Session-done reporting. Then STOP.
