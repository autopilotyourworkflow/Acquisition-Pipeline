<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notable Next.js 16 specifics:
- `middleware.ts` is renamed to `proxy.ts` at the project root; export a `proxy()` function.
- `cookies()` is async — `const c = await cookies()`.
- Turbopack is the default dev + build pipeline.
<!-- END:nextjs-agent-rules -->

# Acquisition Pipeline — agent briefing

## What this project is
Recruiting Pipeline Tool — a take-home assignment for **Hotel Plus** (hotelplus.asia), a Thai hotel-management consulting firm hiring a Full Stack Developer. The app runs HR's full recruiting workflow in one place: scrape candidates, score with Claude, track in a Kanban, schedule interviews via Google Calendar, draft cold-outreach emails via Gmail. Deadline is 5 days from 2026-05-18.

## How to use this file (READ ME FIRST — saves you hours)

**This file is autoloaded into every session via `CLAUDE.md`. You already have it. Do NOT re-read it as "homework" — that's a wasted load.**

Trust the contracts and inventory below. They are the source of truth. Anything not listed here either doesn't exist yet (build it) or is irrelevant to your task.

**Do NOT do these things in a fresh session — they're context-blow-up patterns:**
- ❌ Read `cowork-log.md` cover-to-cover. It's a *narrative deliverable*, not architectural reference. Only open it when (a) writing a new entry and you need to match voice, or (b) looking up a *specific* numbered entry referenced in your prompt.
- ❌ Glob/audit directory structure to "see what exists." The file inventory below tells you. Glob only when looking for one specific file by pattern.
- ❌ Read `lib/anthropic/client.ts` / `lib/audit/wrap.ts` / `lib/anthropic/prompts/*` for "understanding." The Public API contracts section below gives you the signatures. TypeScript will infer the rest at the call site.
- ❌ Spawn Explore agents for "what does this codebase look like" questions. AGENTS.md answers them. Reserve Explore agents for genuinely open-ended search (e.g. "find every call site of X across the repo").
- ❌ Read `PROJECT_MASTER.md` or the original plan at `C:\Users\chano\.claude\plans\let-s-start-planning-addition-prancy-glade.md` unless you have a specific question only those answer (rubric clarification, original Day-by-day reasoning). The status table below supersedes the plan.
- ❌ Implement more than one module per chat session. Each Claude Code session has finite context — split a "phase" into per-module sessions.

**Files that DO autoload (no action needed — they're in your system prompt):**
- This file (`AGENTS.md`)
- `MEMORY.md` (project memory index at `C:\Users\chano\.claude\projects\e--BEAM-Work-Antigravity-Workspaces-Resume-Screener\memory\MEMORY.md`)

**Files to open on-demand only:**
- A specific cowork-log entry by number — `Read cowork-log.md` with `offset` and `limit` to grab just that entry
- A specific migration file when reasoning about schema — `Read supabase/migrations/000N_*.sql`
- The component or route you're modifying — read THE file you're editing, not its neighbors

## Public API contracts (use these — don't re-derive from source)

**Audit wrapper** (every mutation goes through this — `lib/audit/wrap.ts`):
```ts
withAudit<T>({ actorId, orgId, action, table, targetId, before, mutate })
  => Promise<{ after: T | null; logId: string; afterHash: string | null }>
// `mutate: () => Promise<T | null>` is the actual DB write. Uses service-role
// client internally for the audit insert only — mutation runs on whatever
// client the closure captures.

computeRowHash(row)   // sha256(canonicalJSON), excludes row_hash + updated_at
canonicalJSON(value)  // RFC-8785-ish, sorted keys
sha256Hex(input)      // node:crypto helper
```

**Claude client** (single SDK wrapper — `lib/anthropic/client.ts`):
```ts
callWithTool<T>({ model, system, messages, tool, maxTokens?, temperature? })
  => Promise<{ value: T; telemetry: ClaudeTelemetry }>
// `model: 'claude-opus-4-7' | 'claude-haiku-4-5'`
// `system: CacheableTextBlock[]` (set `cache: true` on the JD body)
// `tool: ToolDefinition<T>` from lib/anthropic/tools/*
// Default temperature: 0 (deterministic). Override only when sampling diversity matters.

streamWithTool<T>({ ...same args })
  => { stream: AsyncIterable<RawMessageStreamEvent>; result: Promise<ToolCallResult<T>> }

ClaudeTelemetry = { model, input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens,
  cost_usd, retries, duration_ms }

ClaudeValidationError  // thrown on zod validate failure — carries telemetry
                       // so failed scores can still show "tokens spent: $X"
```

**Scoring prompts** (`lib/anthropic/prompts/`):
```ts
loadActiveScoringPrompt() => Promise<{ version, personaText }>
  // org-wide active, from scoring_prompts table; falls back to file constant
loadScoringPromptForJd(jd: { id, scoring_persona_override })
  => Promise<{ version, personaText }>
  // per-JD override first, then org active, then file fallback
buildScoringMessagesWithPersona(personaText, { jdTitle, jdBody, jdMustHave,
  jdNiceToHave, candidateName, candidateText })
  // returns { system: [...persona, cacheable jdBlock], messages: [user] }
```

**Server Actions** (every one wraps `withAudit`):
```ts
// app/actions/candidates.ts
createCandidate(input)         updateCandidateStage({ candidateId, stage })
updateCandidate({ candidateId, patch })   deleteCandidate({ candidateId })
// app/actions/jds.ts
createJd(input)   updateJd({ jdId, patch })   deleteJd({ jdId })
// app/actions/prompts.ts
saveScoringPrompt({ personaText })   activateScoringPrompt({ promptId })
// All return: { ok: true, data: T } | { ok: false, error: string }
```

**Supabase clients** (`lib/supabase/`):
```ts
createClient()       // server.ts — user-scoped, RLS-enforced, async
createAdminClient()  // admin.ts — service-role, bypasses RLS. SERVER-ONLY.
                     // Never import from a 'use client' file.
```

**DB shapes** (`lib/db/types.ts`): `CandidateRow`, `JdRow`, `ScoreRow`, `AttachmentRow`.
**Enums** (`lib/db/enums.ts`): `CandidateStage`, `CandidateSource`, `STAGE_LABELS`, `SOURCE_LABELS`, etc.
**Constant** (`lib/db/constants.ts`): `ORG_ID = '00000000-0000-0000-0000-000000000001'`.

**SSE event types** (for streaming endpoints — convention used by `/api/score/run`):
```
event: <name>
data: <JSON>

```
Client parses with `fetch().body.pipeThrough(new TextDecoderStream())`.
EventSource is GET-only — use ReadableStream for POST endpoints.

## Current file inventory (Phase 2 complete state)

**Routes (all dashboard routes inside `app/(dashboard)/`):**
```
/                              app/page.tsx
/login                         app/(auth)/login/
/auth/callback                 app/auth/callback/route.ts
/tracker                       app/(dashboard)/tracker/  (Kanban + Table + dialog)
/jds  /jds/new  /jds/[id]      app/(dashboard)/jds/      (list + editor)
/screener                      app/(dashboard)/screener/ (shell + history)
/candidates/[id]               app/(dashboard)/candidates/[id]/
/activity                      app/(dashboard)/activity/ (list + undo)
/settings  /settings/prompts   app/(dashboard)/settings/
```
Every dashboard route has a `loading.tsx` sibling (skeleton via `components/ui/skeleton.tsx`).

**API:**
```
/api/score/run                 POST, SSE — single + team mode
/api/attachments/upload        multipart POST — unpdf + sha256 dedup
/api/audit/undo                POST — any-age revert
/api/scrape/url                POST — fetch + cheerio + Haiku normalize
/api/scrape/paste              POST — Haiku normalize
/api/scrape/pdf                POST { attachmentId } — read parsed_text + normalize
/api/scrape/screenshot         POST — Opus vision + extract_candidate tool
/api/scrape/thirdparty         POST — Proxycurl (BYO key) + Haiku flatten
```

**Libraries:**
```
lib/anthropic/client.ts                    Claude SDK wrapper
lib/anthropic/tools/submit_score.ts        scoring tool def + zod
lib/anthropic/tools/extract_candidate.ts   scraper tool def + zod
lib/anthropic/prompts/scoring.v1.ts        file fallback persona + buildScoringMessages
lib/anthropic/prompts/manager.ts           team-mode manager prompt
lib/anthropic/prompts/load.ts              DB-backed prompt loader
lib/audit/wrap.ts                          withAudit HOF + crypto helpers
lib/google/oauth.ts                        encrypt/decrypt + getGoogleAccessToken
lib/scrape/normalize.ts                    single funnel: rawText → extract_candidate tool
lib/db/{constants,enums,types}.ts          shared
lib/supabase/{server,browser,admin,middleware}.ts
```

**Schema (migrations applied — all 5):**
- `0001_init.sql` — full base schema, RLS, 12 tables, seed JD
- `0002_phase2_fixes.sql` — `attachments.content_hash` + `scoring_prompts` table + seed v1
- `0003_team_scoring.sql` — `scores.scoring_mode` + `scores.team_agents`
- `0004_per_jd_prompt.sql` — `job_descriptions.scoring_persona_override`
- `0005_user_settings.sql` — `user_settings` table (per-user, encrypted Proxycurl key)

**Components:**
```
components/ui/                  shadcn primitives (button, dialog, input, etc.)
                                + skeleton.tsx + sonner.tsx (Toaster wrap)
components/candidates/          StageBadge, SourceBadge
components/screener/            ScoreCard, ScoreStream.client
```

**Routes (also exists — Phase 3 partial):**
- `/scraper` — tabbed UI: URL / Paste / PDF / Screenshot / Third-party API. Single funnel via `lib/scrape/normalize.ts`, editable preview before save through `createCandidate` action.

**Things that DON'T exist yet (build when phases get there):**
- `lib/google/calendar.ts` — Google Calendar SDK wrapper (Phase 3c)
- `lib/google/gmail.ts` — Gmail SDK wrapper (Phase 4)
- `app/(dashboard)/schedule/` — single-attendee scheduler (Phase 3c)
- `app/(dashboard)/settings/integrations/` — scope status page (Phase 3c)
- `app/api/interviews/*` — interview creation (Phase 3c)
- `extension/` — Chrome MV3 (Phase 5)

## Files this project does NOT use
- `react-pdf` — not installed. Use `unpdf` for parsing.
- `pdf-parse` — replaced by `unpdf`.
- `framer-motion` — not installed. CSS transitions only.
- `@dnd-kit/sortable` is installed but unused — Kanban uses just `@dnd-kit/core`.

## Reference docs (open these on demand only)
- `PROJECT_MASTER.md` — original assignment brief + grading rubric
- The Day-1 plan at `C:\Users\chano\.claude\plans\let-s-start-planning-addition-prancy-glade.md`
- The `cowork-log.md` — narrative decisions (open by specific entry # only)

## Tech stack (locked — do not revisit)
- Next.js 16 (App Router, TypeScript) + Tailwind v4 + shadcn/ui primitives
- Supabase (Auth + Postgres + Storage + RLS) — single-org model, hardcoded `org_id`
- Claude only: `claude-opus-4-7` for scoring/email/vision; `claude-haiku-4-5` for cheap normalization
- Vercel deploy + Cloudflare DNS → `acq.autopilotyourworkflow.com`

## Brand tokens (locked)
Navy `#17202E` + Cream `#FAF7F2` + Terracotta `#BD5B3C`. Fraunces (display) + Inter (body) + JetBrains Mono. No gradients, max radius 8px, subtle shadows. See `app/globals.css` for the full token set.

## Architectural conventions
- Every mutation goes through `lib/audit/wrap.ts:withAudit()` so the activity log + undo backbone gets every change.
- Every Claude call goes through `lib/anthropic/client.ts` (single retry / cache / telemetry wrapper).
- Structured output from Claude uses tool-use forcing — never free-form JSON parsing. Tool schemas live in `lib/anthropic/tools/`.
- Service-role Supabase client (`lib/supabase/admin.ts`) is server-only — never import from a `'use client'` file.
- Scraping fallbacks all funnel through `lib/scrape/normalize.ts` so there's one save path.
- 2-tier roles: `owner` + `member`. First signup becomes owner automatically via the `handle_new_user()` trigger.
- Auth has two paths (Google OAuth + Email OTP) and is decoupled from Google API permissions — Calendar/Gmail scopes are granted separately in Settings → Integrations.

## Preferences observed
- **Function before form.** Don't pause feature work to polish a screen mid-build — visual polish is its own pass after the Day-4 MVP cut line. Brand tokens are locked, what's underwhelming is layout/copy and that's intentional for now.
- **Explain WHY.** The user is a "vibe coder" — strong intuition, less formal jargon. When concepts come up (architecture choices, library trade-offs, OAuth flows), explain the reasoning, not just the command.

## Secrets policy
- All real secret values live in `.env.local` (gitignored) and in Vercel's Environment Variables UI for production.
- `.env.example` is committed but contains only KEY names with no values.
- Never echo secret values back to the user in chat.
- Final-phase secrets audit (see plan) rotates everything before the repo flips to public.

## Build progress

| Phase | Days | Status |
|---|---|---|
| 1 — Foundation (scaffold, DB schema, auth, deploy) | Day 1 | ✅ deployed to `acq.autopilotyourworkflow.com`, login verified end-to-end with both code + magic-link |
| 2 — AI core (Resume Screener + Applicant Tracker) | Day 2 | ✅ **COMPLETE.** Foundation (`withAudit` HOF + Claude client w/ retry/cache/telemetry/tool-use forcing + `scoring.v1` prompt). Tracker (Kanban + Table + JD CRUD, click-through, score badges, drag w/ UndoToast). Screener (SSE stream, ScoreCard, unpdf upload + dedup, model picker, team-mode 3+1, score history). Editable prompts (`/settings/prompts`), per-JD overrides, `/activity` audit log, any-age Undo, candidate detail page, bundled OAuth scopes. 20 cowork-log entries. Migrations 0001-0004 applied. |
| 3 — Scraper + Scheduler basics | Day 3 | 🟡 **partial.** 3a (OAuth tokens) ✅, 3b (Scraper — all 5 tabs) ✅, 3c (Scheduler + Settings/Integrations) ❌ — see `docs/phase-3-prompt.md` for status and `docs/phase-3c-scheduler.md` for the remaining session prompt. |
| 4 — Overdelivery (cold email, FreeBusy, undo/redo conflict, invites, **auto-email-reader**, **AI prompt-builder interview**) | Day 4 | not started |
| 5 — Browser extension + polish + demo | Day 5 | not started |
| 6 — Final Phase: secrets audit + handoff | end | not started |

Update this table at the end of each phase. Append a fresh entry to `cowork-log.md` after every major decision or successfully completed module.

## Phase 4 — auto-email-reader feature (added 2026-05-19)

A user-requested overdelivery feature added during Phase 2 conversations:

**Goal:** automatically watch a chosen Gmail inbox for incoming candidate emails (resumes, CVs, cover letters as PDF attachments) and auto-create + auto-score the candidates against a default JD. Opt-in, per-user.

**Implementation sketch** (Day 4):
- Add `gmail.readonly` to the bundled OAuth scopes in `app/(auth)/login/login-form.client.tsx`. Drop `prompt=consent` only if we need to re-prompt existing users; otherwise add the scope to the request list and Google will re-consent on next sign-in.
- New table `gmail_watch_configs` (one per user): `user_id`, `is_active`, `from_filter` (optional list of allowed senders), `subject_filter` (default: `resume OR CV OR "cover letter" OR application`), `default_jd_id`, `last_polled_at`, `last_message_id`.
- New endpoint `app/api/cron/gmail-poll/route.ts` invoked by Vercel Cron every 15 minutes (`vercel.json` cron config). For each active config:
  - Decrypt + refresh the user's Google access token via `oauth_tokens`.
  - `gmail.users.messages.list?q=...&after=<last_polled_at>` to find new matches.
  - For each message: download any PDF attachments, run them through `app/api/attachments/upload` logic (hash-dedup'd), create a `candidates` row with `source: 'email'` (new enum value — migration), trigger a single-mode score against the configured default JD.
  - Update `last_polled_at` + `last_message_id` to skip the same message next poll.
- UI at `/settings/integrations`: toggle, sender filter, default JD picker, last-poll status.
- Notifications: in-app "New candidate auto-scored" toast or a "New" badge on the tracker (push beyond scope for take-home — could be Day 5 polish).

**Why Phase 4:** depends on Phase-3 work (Gmail OAuth flow + Calendar integration patterns) and the scoring pipeline being solid. Slots cleanly into the existing scrape → score → email-draft pipeline.

**Status:** PLANNED, not yet built.

---

## Phase 4 — AI prompt-builder interview (added 2026-05-19)

A user-requested overdelivery feature: when a user creates or edits a JD, offer an AI-driven "interview" that asks 4-6 focused questions about the role and then drafts a tailored scoring persona for it. Output gets saved as the JD's `scoring_persona_override`.

**Why this matters:** the per-JD prompt override (Phase 2, migration 0004) is powerful but cold-start hostile — most users won't know how to write a good scoring persona from scratch. This feature turns the override from a power-user feature into something anyone can use well.

**Flow (UX):**
1. On the JD editor page (`app/(dashboard)/jds/jd-editor.client.tsx`), next to the "Advanced — custom scoring persona" section, add a button: **"AI-assisted: help me write this"**.
2. Click → opens a chat-style dialog (or sidesheet) running Haiku 4.5.
3. The interviewer asks the user one or two questions at a time, conversationally — not all at once. Questions cover:
   - Seniority bracket (entry / mid / senior / principal / executive)
   - The single most important quality (shipping speed / technical depth / collaboration / business acumen / creative judgment / domain expertise)
   - Anti-bias considerations specific to this role (e.g., for design roles: "don't penalize CVs without CS coursework"; for sales: "weight outcomes over titles")
   - Describe a candidate this team would call to congratulate (the 9/10 picture)
   - Describe a candidate that would clearly miss (the 3/10 picture)
   - Domain-specific signals worth weighting (industry tenure, certifications, language fluency, etc.)
4. User can answer in free text, or pick "skip — use smart default" on any question.
5. After enough information is gathered, the interviewer calls a tool `propose_scoring_persona` which returns:
   - `persona_text: string` — the full scoring persona, inheriting the global default's structure (rubric, anti-bias framing, tool-only output requirement) and customizing the role-specific guidance
   - `summary: string` — a one-paragraph rationale for the choices made (shown to the user for confidence-building)
6. User sees the proposed persona in a pre-filled textarea, can edit, then clicks **"Use for this JD"** which saves it to `scoring_persona_override` on the JD row.

**Files to create when implemented:**
- `lib/anthropic/prompts/persona-interview.ts` — the interviewer's system prompt (questions list, conversation strategy, when to call the tool)
- `lib/anthropic/tools/propose_scoring_persona.ts` — zod schema + tool definition
- `app/api/jds/propose-prompt/route.ts` — SSE-streaming endpoint that handles multi-turn conversation (POST per turn, body includes message history)
- `components/jds/PromptInterview.client.tsx` — chat UI with input box, message bubbles, "Save persona" CTA at the end
- Wire into `app/(dashboard)/jds/jd-editor.client.tsx` next to the Advanced section

**Implementation notes:**
- Use Haiku 4.5 — conversational, low-stakes, ~$0.005-0.01 per full interview
- Multi-turn: client sends `{ messages: [...] }` per turn; route handler appends the model's response and streams it back. Client manages the conversation array.
- Tool-use forcing only on the FINAL turn — when the model decides it has enough info, it calls `propose_scoring_persona`. Up to that point, free text (questions to the user).
- A safety net: cap conversations at ~10 turns. If the model hasn't called the tool by then, force the tool call with a directive.
- Persona generation references the GLOBAL active prompt as a structural template — the AI shouldn't reinvent the rubric/anti-bias framing, just customize the role-specific layer.

**Why Phase 4 / Day 4:**
- Depends on per-JD prompt override (✅ Phase 2, migration 0004)
- It's overdelivery — not in the rubric's 4 modules
- Pairs naturally with auto-email-reader (both are "AI helping the user set up the system")
- High UX-grade ROI (25% of the rubric) — reviewer sees the system *teaching* the user how to use it well

**Status:** PLANNED, not yet built.

---

## Session-done reporting (mandatory on every session)

Before declaring your session complete, you MUST emit a structured report. This is non-negotiable — without it, Ben can't checkpoint and verify quality.

When you finish the last task in the session, output a final message in this exact shape:

```
## Session complete — <session name>

**Files created:**
- path/to/file.ts — one-line purpose
...

**Files modified:**
- path/to/file.ts — what changed
...

**Migrations to run manually:**
- supabase/migrations/000N_*.sql (or "none")

**Env vars to set:**
- VAR_NAME (or "none")

**Smoke tests I ran and what passed:**
- [ ] description of test 1 → result
- [ ] description of test 2 → result

**Smoke tests YOU need to run before signing off:**
- [ ] description of test 1
- [ ] description of test 2

**Cowork-log entry added:** entry # — title (or "deferred" with reason)

**What I deliberately did NOT do (and why):**
- item — reason

**Recommended next session:** docs/phase-XX.md (or "none — phase complete")
```

After printing this, STOP. Do not commit unless Ben explicitly says to. Do not start the next session. The point is to give him a verification surface — if anything looks wrong, he'll push back BEFORE the commit hits main.

## Writing handoff prompts for OTHER sessions (if Ben asks you to draft one)

When Ben says "write me the prompt for the next chat" or similar, you are *NOT* writing a free-form summary. You are writing a tight contract. Hard rules:

- **Token cap: ~1000 tokens.** If your prompt is longer than ~150 lines of markdown, it's too verbose. Cut.
- **Inline pre-decided contracts.** Never ask the next agent to "propose the architecture" — that triggers research mode, which is the #1 token sink. State the decision: "Use AES-256-GCM. Key from `OAUTH_ENCRYPTION_SECRET` env var. Encrypt before INSERT to `oauth_tokens.refresh_token_encrypted`." Lock it.
- **Anti-patterns at the top.** Every handoff prompt must include a "Do NOT" block: don't load cowork-log cover-to-cover, don't audit directory structure, don't re-read library files whose API is in this file, don't spawn Explore agents for "what does this look like" questions.
- **Explicit file list.** "Files to create: 1. X, 2. Y, 3. Z." Not "build whatever you need to make this work."
- **Out-of-scope list.** "Do NOT build: A, B, C — those are Phase N." This stops well-meaning over-implementation.
- **Smoke test list.** Exact assertions to verify before reporting done.
- **First action.** "Confirm <thing> with Ben, then build straight through. No proposal phase — the contracts above are locked."
- **No `Read these files first` lists.** AGENTS.md autoloads. MEMORY.md autoloads. The next chat already has both. Telling it to "re-read" forces duplicate loads and wastes 30k+ tokens.

Save the new prompt under `docs/phase-XYZ.md`. The naming convention is `phase-<phase-number><letter>-<short-name>.md` (e.g. `phase-4a-cold-email.md`). After Ben confirms the prompt, also update `docs/phase-3-prompt.md` (the status index) to point at it.

Look at `docs/phase-3a-oauth.md`, `docs/phase-3b-scraper.md`, and `docs/phase-3c-scheduler.md` as templates of what a tight prompt looks like — they're 600-900 tokens each and complete.

## Cowork-log voice (only relevant when WRITING a new entry)

The cowork log is a graded *narrative* deliverable. **It is not architectural reference — do not load it for context.** Only open it when:
1. You're about to append a new entry and need to skim the last 2-3 entries to match voice, OR
2. Your prompt explicitly references a specific entry number (e.g. "see entry #6 for the OAuth encryption rationale") — in which case `Read cowork-log.md` with `offset` and `limit` to grab just that entry.

When you DO append, match the voice:
- First-person, narrative, opinionated. The user is the protagonist making the call; AI is the collaborator.
- Show *thinking*, not specs. The plan file has the specs. The log captures the reasoning that produced them.
- One date marker per day (e.g. `*Day 2 — 2026-05-19*`) inserted once before that day's first entry. Don't repeat the date.
- Each entry: ~150–300 words. Lead with the framing question. **Bold the key takeaway** at the end.
- Skip the Objective/Pros/Cons/Outcome template — use prose unless the structure adds clarity.
- Goal: a reviewer skimming this should feel they understand how this team thinks, not just what was built.
