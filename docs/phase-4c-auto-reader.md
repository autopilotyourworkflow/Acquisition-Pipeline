# Phase 4c — Auto-email-reader (Gmail polling + auto-score)

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home. Phases 1, 2, 3 done; pre-Phase-4, 4a, 4b shipped. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, `lib/anthropic/client.ts`, `lib/google/oauth.ts`, `lib/google/gmail.ts`, `lib/scrape/normalize.ts`, or `app/api/attachments/upload/route.ts` for "understanding" — AGENTS.md has the contracts.
- Don't spawn Explore agents for codebase shape.
- Don't audit directory structure — AGENTS.md has the inventory.
- Don't deliberate on the contracts below — they're locked.
- Don't use Vercel native cron (Hobby plan = daily-only). Use cron-job.org (locked below).
- Don't use Gmail Push / Pub/Sub. Polling only.

## Goal
Auto-watch a configured Gmail inbox. Every poll tick (default 15 min, configurable per-user from 30s to 30 min), check for new messages matching a subject filter + having ≥1 PDF attachment. For each match: download the PDFs, hash-dedup, create candidate(s) with `source: 'email'`, auto-score against a default JD. Demonstrates the system "going to work" without HR clicking anything.

## Pre-decided contracts
- **Trigger:** **cron-job.org** (free external scheduler). Ben sets up one job pointing at `https://acq.autopilotyourworkflow.com/api/cron/gmail-poll` at 1-minute cadence. Reason: Vercel Hobby allows only daily crons. The endpoint itself decides per-user cadence by checking `next_poll_at` per config row.
- **Endpoint auth:** new env var `CRON_SECRET`. The endpoint requires `Authorization: Bearer ${CRON_SECRET}` header. Cron-job.org supports custom headers — set this in the job config. Returns 401 if missing.
- **Per-user polling frequency:** stored in `gmail_watch_configs.polling_frequency_sec` (default 900 = 15 min). Endpoint logic per config row: `if now < next_poll_at: skip` else process and set `next_poll_at = now + polling_frequency_sec`.
- **Business hours:** stored per-config (`business_hours_start`, `business_hours_end`, `timezone`). Default Asia/Bangkok 09:00–18:00. Out-of-hours = log + early return for that config (still updates `next_poll_at` so we don't try every minute).
- **Subject filter default:** `resume OR CV OR "cover letter" OR application`. Uses Gmail's native query syntax — passed straight to `gmail.users.messages.list?q=`.
- **Sender allowlist:** optional `from_filter text[]` column. Empty = accept any sender. Non-empty = only process messages where `from` matches one of the listed addresses.
- **Default JD:** `default_jd_id` on the config. The scorer runs against this JD. Phase 5 could add per-sender JD routing — not now.
- **Ingest rule:** message must match subject filter AND have ≥1 PDF attachment. Each PDF = one candidate (a single email with 3 PDFs creates 3 candidates). Dedup by candidate email — if a candidate row with the same email already exists in this org, append the new PDF as an additional `attachments` row to that candidate (don't create duplicate candidate rows).
- **Dedup at the message level:** track `last_processed_message_id` per config so a poll doesn't reprocess the same message. The query uses `q=...&after=<unix ts of last poll>` plus an in-memory check against `last_processed_message_id`.
- **Scoring:** single-mode, using whatever the active scoring prompt is. Use existing `/api/score/run` logic by calling the underlying functions directly (not via HTTP). Each scored candidate gets a `scores` row.
- **Email parsing:** for `from`, parse the standard RFC 5322 format `"Name" <email@host>`. Capture both display name (becomes candidate name) and address (becomes candidate email).
- **PDF processing:** same path as `/api/attachments/upload` — `unpdf` parse, hash dedup against existing attachments. If attachment already exists for this candidate (same hash), skip rescoring (it's the same CV).
- **Audit:** every candidate insert, attachment insert, and score insert goes through `withAudit` exactly like the manual flows.

## Migration

`supabase/migrations/0008_auto_reader.sql`:
- New table `gmail_watch_configs`:
  - `id uuid pk`, `org_id uuid`, `user_id uuid` (unique — one config per user), `is_active boolean default false`
  - `default_jd_id uuid references job_descriptions(id)`
  - `from_filter text[]` (default `'{}'`)
  - `subject_filter text default 'resume OR CV OR "cover letter" OR application'`
  - `polling_frequency_sec integer default 900`
  - `business_hours_start time default '09:00'`
  - `business_hours_end time default '18:00'`
  - `timezone text default 'Asia/Bangkok'`
  - `next_poll_at timestamptz default now()`
  - `last_polled_at timestamptz`
  - `last_processed_message_id text`
  - `last_poll_status text` (latest run summary, useful for the UI)
  - `last_poll_error text`
  - `created_at`, `updated_at`
- RLS: user can read/write only their own row (`user_id = auth.uid()`). Service role (cron endpoint) bypasses RLS via `createAdminClient()`.
- Add `'email'` to the `candidate_source` enum: `ALTER TYPE candidate_source ADD VALUE 'email';`

## Files to create

1. `lib/google/gmail.ts` — extend with:
   - `listInboxMessages({ userId, query, after })` → `gmail.users.messages.list?q=<query>&after=<unix ts>`. Returns the message ids list.
   - `getMessage({ userId, messageId })` → `gmail.users.messages.get?format=full`. Returns headers + payload.
   - `getAttachment({ userId, messageId, attachmentId })` → `gmail.users.messages.attachments.get`. Returns the binary buffer.
2. `lib/auto-reader/process.ts` — pure server logic, no HTTP:
   - `processConfig(config)`:
     - business-hours check → early return + update `next_poll_at`
     - `next_poll_at > now` → early return
     - call `listInboxMessages` with the config's query + `after = last_polled_at`
     - for each message: filter by `from` allowlist + has-PDF-attachment, then for each PDF: extract candidate (use existing `lib/scrape/normalize.ts` after PDF→text via `unpdf`), insert/find candidate (dedup by email), attach PDF (hash dedup), score against `default_jd_id`
     - update config: `last_polled_at = now`, `next_poll_at = now + frequency`, `last_processed_message_id = latest msg id seen`, `last_poll_status = 'OK: ingested X candidates, skipped Y'`
   - `processAllActiveConfigs()` → iterates all active configs, calls `processConfig` for each. Catches per-config errors and writes to `last_poll_error` so one user's broken config doesn't blow up the cron run.
3. `app/api/cron/gmail-poll/route.ts`:
   - Verify `Authorization: Bearer ${CRON_SECRET}` header (use `process.env.CRON_SECRET`)
   - Use `createAdminClient()` (service role) to bypass RLS — the cron endpoint isn't authenticated as any particular user
   - Call `processAllActiveConfigs()`
   - Return `{ ok: true, processed: configCount, ingestedCandidates: N, errors: [...] }` JSON
   - Wrap the top-level handler in a try/catch — never crash the cron (always return 200 even if partial failure, so cron-job.org doesn't keep retrying)
4. `app/(dashboard)/settings/auto-reader/page.tsx` — server component:
   - Fetch user's existing `gmail_watch_configs` row (or null)
   - Fetch user's `job_descriptions` for the JD picker
   - Check Gmail scope on `oauth_tokens` → if `gmail.readonly` missing, show "Connect Gmail with read access" empty state (we may need to add `gmail.readonly` to the bundled scopes — see "Scope addition" below)
   - Render the form (client component)
5. `app/(dashboard)/settings/auto-reader/auto-reader-form.client.tsx` — form with:
   - Active toggle (`is_active`)
   - Default JD picker (dropdown of user's JDs)
   - Sender allowlist (chip input — empty = any)
   - Subject filter (text input, defaults to the standard query)
   - Polling frequency dropdown — `15 min` / `5 min` / `1 min (demo)` / `30 sec (demo)`
   - Business hours: start time + end time + timezone (default Asia/Bangkok)
   - Below the form: "Last poll status" — shows `last_polled_at`, `last_poll_status`, `last_poll_error`
   - Save button → server action `saveAutoReaderConfig({ ... })` that upserts via `withAudit`
6. `app/(dashboard)/settings/auto-reader/loading.tsx`
7. Wire entry: add a link/row to `app/(dashboard)/settings/page.tsx` → "Auto-Reader" row → `/settings/auto-reader`. Same row pattern as the existing "Integrations" link.

## Scope addition

Gmail polling needs `https://www.googleapis.com/auth/gmail.readonly` to list messages and read attachments. **AGENTS.md** notes our bundled scopes include `gmail.compose` and `gmail.send` but not `gmail.readonly`. Add it to the bundled OAuth request in `app/(auth)/login/login-form.client.tsx`. Existing users need to re-consent — drop `prompt=consent` on the next OAuth round so Google re-prompts them. The `/settings/integrations` page should show a "Gmail Read" row with the same green/red pattern.

## Env var

Add `CRON_SECRET` to `.env.local` (use a long random string — `openssl rand -hex 32`) and to Vercel's Environment Variables UI for production. Update `.env.example` with the key name (no value).

## cron-job.org setup (manual, after deploy)

After the code is shipped, Ben sets up:
1. cron-job.org account (free).
2. New job:
   - URL: `https://acq.autopilotyourworkflow.com/api/cron/gmail-poll`
   - Schedule: `Every 1 minute`
   - Custom HTTP header: `Authorization: Bearer <CRON_SECRET value>`
   - Request method: `POST`
   - Notifications: enabled (cron-job.org pings him if the endpoint fails 3× in a row)

The Auto-Reader settings page should include a "Set this up at cron-job.org" callout with the URL + a copy button for the secret (or a note "the secret is in your env vars").

## Out of scope (do NOT build)
- Gmail Push / Pub/Sub — polling only
- Per-sender JD routing — single default JD only
- Auto-reply on receiving (e.g. "thanks, we'll review!")
- In-app push notifications for newly scored candidates (toast on next page load is fine — that's automatic via the activity log)
- Multi-user inbox sharing (one config per user is plenty)
- OCR for image-based PDFs (unpdf handles text-extractable PDFs; image PDFs just fail silently with a `last_poll_error`)
- Calendaring on email replies (Phase 5 / never)

## Smoke tests
- [ ] Apply migration `0008_auto_reader.sql`
- [ ] Set `CRON_SECRET` env var locally + in Vercel
- [ ] Add `gmail.readonly` to bundled scopes → sign out + sign in with Google → `/settings/integrations` shows "Gmail Read: granted"
- [ ] Visit `/settings/auto-reader` → form renders with defaults (toggle off)
- [ ] Turn toggle on → pick default JD → set polling to 30s → set business hours to 00:00–23:59 (for testing) → save → toast confirms
- [ ] Manually hit `POST /api/cron/gmail-poll` with the bearer token via `curl` → returns `{ ok: true, processed: 1, ingested: 0 }` (no new emails yet)
- [ ] Send yourself an email with subject "resume — test candidate" + a CV PDF attachment → wait 30s
- [ ] Hit the endpoint again → returns ingested: 1
- [ ] Visit `/tracker` → new candidate appears with `source: email`
- [ ] Visit `/candidates/<id>` → CV attachment present + score against the configured JD
- [ ] Send the same email twice → second poll: 0 ingested (dedup by candidate email)
- [ ] Set business hours to 00:00–01:00 (likely outside current time), poll → returns processed: 1, ingested: 0, log entry mentions "outside business hours"
- [ ] Send curl without bearer token → 401
- [ ] cron-job.org configured + verified pinging every minute

## First action
Confirm with Ben:
1. Add `gmail.readonly` to bundled OAuth scopes (requires existing users to re-consent) — OK?
2. The cron-job.org setup is a manual step at the end — make sure he's aware before building so he can plan time for it.

Then build straight through.

## Last action (mandatory)
Emit the **Session-done report** described in AGENTS.md → Session-done reporting. Include the manual cron-job.org setup as a "Smoke tests YOU need to run" item. Then STOP.
