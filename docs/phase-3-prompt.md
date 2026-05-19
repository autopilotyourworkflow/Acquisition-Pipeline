# Phase 3 — status + remaining session prompt

## What's done

- ✅ **Phase 3a — Google OAuth token persistence** (commit `f725968`). `lib/google/oauth.ts` ships `encryptRefreshToken` / `decryptRefreshToken` / `upsertOAuthTokens` / `getGoogleAccessToken`. AES-256-GCM. `app/auth/callback/route.ts` upserts on Google sign-in. Migration `0005_user_settings.sql` added a per-user settings table for Proxycurl key storage.
- ✅ **Phase 3b — Scraper** (same commit). All 5 tabs were built (not just the 3-tab MVP I'd planned): URL, Paste, PDF, Screenshot (Opus vision), Third-party (Proxycurl BYO-key). Single funnel: `lib/scrape/normalize.ts` → `extract_candidate` tool → editable HITL preview → `createCandidate`.
- ✅ Cowork-log entries 26-28 (commit `00de018`) cover the OAuth-encryption decision, the single-funnel design, and the HITL preview rationale.

## What's left

- ❌ **Phase 3c — Scheduler basics + Settings/Integrations** — see [phase-3c-scheduler.md](./phase-3c-scheduler.md).

## Suggested next move

**Before opening a fresh chat for 3c**, smoke-test the existing 3a + 3b work yourself:

1. Sign in with Google. Check Supabase SQL Editor: `SELECT user_id, scopes, octet_length(refresh_token_encrypted) FROM oauth_tokens;` — should show 1 row, blob ~70-100 bytes.
2. Go to `/scraper`. Paste a CV in the Paste tab → editable preview appears → edit a field → Save → candidate lands in `/tracker`.
3. Try the URL tab with a public profile URL — confirms cheerio + Haiku do their job.
4. Try the PDF tab with a CV PDF — confirms reuse of the existing `/api/attachments/upload` route + parsed_text caching.

If those four checks pass, the foundation is solid and 3c can land cleanly. If something fails, prefer fixing-in-place over re-running 3a/3b — the implementation is good code, just needs verification.

## Why was this split?

Phase 3 was originally one monolithic prompt. The fresh chat that ran it burned through 1M context during discovery (read the whole cowork-log, spawned Explore agents for "audit" tasks, re-read `lib/anthropic/client.ts` twice, over-built the Scraper to all 5 tabs at once). The fix is **one module per chat session**, with anti-patterns and pre-decided contracts inlined.

The two completed prompts ([phase-3a-oauth.md](./phase-3a-oauth.md) and [phase-3b-scraper.md](./phase-3b-scraper.md)) are kept on disk as **templates** — they're what a thin handoff prompt looks like. Use them as the structure for Phase 4 and Phase 5 prompts when those come.

## Phase 4, 5, Final — same split pattern

When you reach Phase 4 (overdelivery), do NOT write a single big handoff prompt. Split into per-feature sessions:

- `phase-4a-undo-conflict.md` — finish the Day-4 conflict detection on Undo (compare current row hash to action's `after_hash`, prompt with diff)
- `phase-4b-cold-email.md` — Gmail draft creation pipeline (score ≥ threshold → auto-draft)
- `phase-4c-freebusy.md` — multi-party FreeBusy slot finder
- `phase-4d-invite-flow.md` — invitations + Team settings + Owner revoke
- `phase-4e-email-reader.md` — auto-email-reader (planned in AGENTS.md)
- `phase-4f-prompt-interview.md` — AI prompt-builder interview (planned in AGENTS.md)

Phase 5 likewise: `phase-5a-extension.md`, `phase-5b-command-palette.md`, `phase-5c-demo-data.md`, etc.
