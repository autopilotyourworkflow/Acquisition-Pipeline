# Phase 3a — Google OAuth token persistence (one chat session)

> ✅ **STATUS: SHIPPED in commit `f725968`.** This file is kept as a *template* of what a thin handoff prompt looks like — refer to it when writing future Phase 4 / 5 / Final per-session prompts.

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home build (recruiting pipeline at `acq.autopilotyourworkflow.com`). Phases 1 and 2 are done. AGENTS.md is autoloaded — **trust it as the source of truth, do not re-read it as homework.**

**Task this session:** persist the Google OAuth `provider_refresh_token` so Calendar + Gmail API calls work after the 1-hour access-token expiry. This is the prereq for Phase 3b (Scraper) and 3c (Scheduler).

**Pre-decided contracts (do not deliberate):**
- Encryption: Node-side AES-GCM (256-bit). Key from `OAUTH_ENCRYPTION_SECRET` env var (32 random bytes, hex-encoded).
- Storage column already exists: `oauth_tokens.refresh_token_encrypted bytea NOT NULL` (see `supabase/migrations/0001_init.sql` table 4.11).
- We write to `oauth_tokens` via the **service-role client** (`createAdminClient()` from `lib/supabase/admin.ts`) — the table has RLS but this is server-orchestrated state during callback.
- Token refresh: when an access token is within 5 minutes of expiry, refresh via `https://oauth2.googleapis.com/token` using the decrypted refresh token + the Google client ID/secret from Supabase's provider config. **The Google client ID and secret are NOT in our env vars** — Supabase manages them. We'll need to add them as `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars in `.env.local` + Vercel (read from Supabase Auth → Providers → Google → copy-paste).

**Files to create (only these — no audit needed):**

1. `lib/google/crypto.ts` — `encryptToken(plain: string): Buffer` + `decryptToken(blob: Buffer): string`. AES-256-GCM with 12-byte IV stored as `iv || ciphertext || tag`. Throws if `OAUTH_ENCRYPTION_SECRET` missing.
2. `lib/google/oauth.ts` —
   - `storeTokens({ userId, accessToken, refreshToken, expiresAt, scopes })` — upserts to `oauth_tokens`. Encrypts before write.
   - `getGoogleAccessToken(userId): Promise<string | null>` — reads `oauth_tokens` row, returns access token if not near expiry, else refreshes via Google's token endpoint and updates the row. Returns `null` if user has no row (signed in via OTP only).
3. `.env.example` — add `OAUTH_ENCRYPTION_SECRET=`, `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=` placeholders (no values).

**Files to modify:**

4. `app/auth/callback/route.ts` — after `exchangeCodeForSession`, pull `session.provider_token`, `session.provider_refresh_token`, `session.provider_token_expires_at` (or compute as `now + 3600s` if absent), call `storeTokens`. Only do this when the session has a `provider_refresh_token` (Google sign-ins have it; OTP sign-ins don't).

**Smoke test (before committing):**
- Sign in with Google (use an account already on the test users list)
- Open Supabase SQL editor → `SELECT user_id, scopes, expires_at, octet_length(refresh_token_encrypted) FROM oauth_tokens;` — should show 1 row with the encrypted blob (~70-100 bytes)
- Call `getGoogleAccessToken(<your user id>)` from a one-off `scripts/smoke-google-oauth.ts` (model the script after `scripts/smoke-audit.ts`) — should return a non-empty string

**Out of scope this session (do NOT build):**
- The `/settings/integrations` page (that's part of Phase 3c)
- Any Calendar or Gmail API calls (Phase 3b/3c)
- Any UI changes to /login or /auth — the existing bundled-scopes flow is correct

**Conventions you already know from AGENTS.md** (do not re-read to confirm): every mutation through `withAudit` (the `storeTokens` upsert qualifies — wrap it), no direct `@anthropic-ai/sdk` imports, service-role client server-only.

**Cowork-log:** append ONE entry under `*Day 3 — <today's date in Bangkok>*` after the smoke test passes. Topic: the encryption-at-rest decision (Node AES-GCM vs the pgcrypto alternative — entry #6 has the historical reasoning, skim only those ~30 lines if you need to). Don't load the whole cowork log.

**First action:** confirm the env vars are set. Ask me:
1. "Add `OAUTH_ENCRYPTION_SECRET` (I'll generate one) to `.env.local` and Vercel?"
2. "Paste the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from Supabase Dashboard → Authentication → Providers → Google here?" (I'll paste them; do not echo back in chat after — just confirm received.)

Then build the 3 files, smoke test, commit, push.
