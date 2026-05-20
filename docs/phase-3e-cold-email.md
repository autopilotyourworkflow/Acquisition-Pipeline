# Phase 3e — Cold email (review-before-send)

Paste into a fresh Claude Code chat.

---

Continuing the Hotel Plus take-home. AGENTS.md autoloaded — trust it as the source of truth. Phases 1–3d done. The `sourced` candidate stage exists (migration 0010). Apify is the outbound LinkedIn backbone. Bookmarklet works for JobsDB / LinkedIn capture.

## Do NOT
- Re-read AGENTS.md, cowork-log, or library files — contracts inlined.
- Spawn Explore agents.
- Build auto-reader / inbound email classifier — that's Phase 4c.
- Build the AI prompt-builder for JDs — that's Phase 4a.
- Touch the bookmarklet / Apify / Sourced-stage code.
- Build mass-send / templates / sequences — single send only.

## What you're building

Outbound-sourced candidates land in stage `sourced`. HR reviews their score, decides to reach out, clicks **"Draft cold email"** — Opus drafts a personalized cold-outreach email referencing the JD + candidate's background, HR edits, sends via Gmail. Sends are logged in a new `emails` table + the activity log.

### Flow
1. Candidate detail page (`/candidates/[id]`) gets a "Draft cold email" CTA. Visible iff candidate has `email` AND `jd_id` AND user has `gmail.send` scope granted.
2. CTA opens a dialog. SSE-stream the draft in (Opus + `compose_cold_email` tool — subject + body + rationale). Show a typewriter as it generates.
3. Editable subject + body textareas. Pre-filled with the draft. HR edits freely.
4. **Send** button → Gmail send via new `lib/google/gmail.ts`. Insert `emails` row with status `sent`, gmail_message_id, sent_at.
5. Activity log entry via `withAudit`. Toast: "Email sent — move candidate to Applied?" with two buttons.

## Locked contracts

**Tool def** `lib/anthropic/tools/compose_cold_email.ts`:
```ts
zod: {
  subject: z.string().min(5).max(200),
  body_markdown: z.string().min(80).max(2000),
  rationale: z.string().min(20).max(500), // shown to HR — why this hook should land
}
```

**Migration `0011_emails.sql`**:
- `emails` table: id uuid pk, org_id, candidate_id fk, jd_id fk, user_id fk, status text CHECK in ('drafted','sent','failed','discarded'), subject text, body_markdown text, rationale text, gmail_message_id text, gmail_thread_id text, sent_at timestamptz, error text, row_hash text, created_at, updated_at. RLS org-scoped via candidate→org.
- `ALTER TABLE user_settings ADD COLUMN email_signature text, ADD COLUMN email_from_name text;`

**Gmail helper** `lib/google/gmail.ts`:
```ts
sendEmail({ userId, to, subject, bodyHtml, bodyText, fromName? })
  => Promise<{ messageId: string; threadId: string }>
// Uses getGoogleAccessToken(userId) from lib/google/oauth.ts.
// Builds RFC2822 MIME with multipart/alternative (text + html).
// POSTs base64url to https://gmail.googleapis.com/gmail/v1/users/me/messages/send
```

**Cold-email prompt** `lib/anthropic/prompts/cold-email.ts`:
- Opus 4.7 (the human voice matters here, not cost)
- System prompt: identity as a recruiting partner for Hotel Plus, anti-spam framing (no fake urgency, no generic openings, no "I came across your profile..." clichés), use specific hooks from the candidate's experience tied to the JD, max 150 words body, signed with user's signature + from_name
- User message: JD title + body, candidate full profile (raw_profile JSON), candidate's score reasoning if available (gives the model context on WHY this candidate is interesting)
- Opus 4.7 deprecated `temperature` — the existing `lib/anthropic/client.ts` already handles that, don't pass temperature manually

**Server actions** `app/actions/emails.ts`:
```ts
sendColdEmail({ candidateId, jdId, subject, body, rationale })
  => { ok: true, emailId } | { ok: false, error }
// withAudit-wrapped. Inserts emails row, calls sendEmail(), updates row with
// gmail_message_id + sent_at on success.

discardDraft({ candidateId, jdId, subject, body }) => { ok }
// Optional — saves a 'discarded' row for the activity log if HR closes the
// dialog without sending. Skip if it complicates the UX.
```

**SSE endpoint** `/api/emails/draft` POST:
```
Body: { candidateId, jdId }
SSE events: draft_partial { text }, draft_complete { subject, body, rationale, telemetry }, draft_error
```

## Files to create
1. `lib/anthropic/tools/compose_cold_email.ts`
2. `lib/anthropic/prompts/cold-email.ts`
3. `lib/google/gmail.ts`
4. `app/actions/emails.ts`
5. `app/api/emails/draft/route.ts` — SSE
6. `components/emails/ColdEmailDialog.client.tsx` — dialog with streaming draft + edit + send
7. Wire the CTA into `app/(dashboard)/candidates/[id]/` page (add a "Draft cold email" button near the JD link)
8. `supabase/migrations/0011_emails.sql`
9. Add "Email signature" + "From name" fields to `/settings/integrations` (extend the existing ApiKeysPanel pattern or add a sibling section)

## Out of scope
- Auto-reply detection / inbound classification (Phase 4c)
- Reply threading display in our app (Phase 4c)
- Multi-touch sequences (follow-up #1, #2, etc.)
- Template library
- Email scheduling (send later)
- Mass-send to multiple candidates
- Bouncing / undeliverable tracking

## Smoke tests YOU run
- [ ] Apply migration 0011 in Supabase
- [ ] `/settings/integrations`: signature + from-name save; reload shows persisted values
- [ ] Candidate detail page for a sourced candidate (with email + JD): "Draft cold email" button visible
- [ ] Without email OR without JD: button hidden with explanatory tooltip
- [ ] Click → dialog opens, subject + body stream in (typewriter), rationale shown below
- [ ] Edit subject + body, click Send → toast confirms, dialog closes
- [ ] Email arrives in recipient inbox; from name matches setting; signature appended
- [ ] `emails` row exists with status='sent', gmail_message_id set, sent_at populated
- [ ] `/activity` shows the email send entry
- [ ] Toast offers "Move to Applied?" → clicking it updates the candidate's stage

## First action
Confirm two things with Beam:
1. What's his default signature + from name? (Or leave blank and let him fill it later.)
2. After send, should we auto-prompt "Move candidate to Applied?" — or just send the email and leave the stage alone (HR drags manually)?

Then build straight through — contracts above are locked.

## Last action (mandatory)
Emit the **Session-done report** per AGENTS.md → Session-done reporting. Then STOP.
