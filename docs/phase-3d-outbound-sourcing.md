# Phase 3d — Outbound sourcing + JobsDB inbound

Paste into a fresh Claude Code chat.

---

Continuing the Hotel Plus take-home. AGENTS.md autoloaded — trust it as the source of truth. Phases 1–3 + Pre-Phase 4 done.

## Do NOT
- Don't re-read AGENTS.md, cowork-log, or library files for context — contracts below are inlined.
- Don't spawn Explore agents.
- Don't build Indeed/SEEK live calls — stubbed with "coming soon" UI for v1.
- Don't build JobsDB auto-detect via Gmail (Phase 4c).
- Don't build cold-email composition or send (Phase 3e).
- Don't pick a different LinkedIn scraping library — Proxycurl is locked.

## What you're building

Two sub-features sharing JobsDB plumbing.

### 3d.A — JobsDB inbound (new `/scraper` tab)
HR opens a JobsDB candidate/application page, copies the URL (and optionally pasted text for login-walled pages), submits to a new "JobsDB" tab. We fetch via the existing URL flow (cheerio + Jina Reader fallback), run `lib/scrape/normalize.ts` with a JobsDB hint, insert candidate with `source: 'jobsdb'`.

### 3d.B — Outbound sourcing (JD → candidates)
JD detail page (`/jds/[id]`) gets a "Find candidates for this JD" button. Click opens a dialog:
- Platform checkboxes: LinkedIn (Proxycurl, enabled by default), JobsDB (enabled, marked *experimental*), Indeed + SEEK (disabled with tooltip "Coming soon — awaiting employer-account integration").
- N picker: 5–50, default 20.
- `Est. cost: $X.XX` line that updates with N + platform selection. Formula: `(0.01 Opus) + (0.10 × N × LinkedIn?) + (0.02 × N × JobsDB?) + (0.05 × N scoring)`.
- "Run" button → POST `/api/source/run` (SSE).

Run flow (in `lib/sourcing/run.ts`):
1. Opus call → `derive_sourcing_query` tool → `{ keywords, titles, location?, seniority? }`.
2. Fan out across enabled providers, splitting N across them.
3. Each result → `lib/scrape/normalize.ts` → `withAudit` insert as `source: 'outbound_sourced'`, `source_url: <profile URL>`, `jd_id: <JD>`.
4. Each insert triggers `/api/score/run` single-mode against same JD.
5. SSE events: `query_derived`, `candidate_found`, `candidate_scored`, `error`, `done`.
6. `sourcing_runs` row recorded with counts + cost at end.

## Locked contracts

**Tool def** `lib/anthropic/tools/derive_sourcing_query.ts`:
```ts
zod: {
  keywords: z.array(z.string()).min(1).max(10),
  titles: z.array(z.string()).max(5),
  location: z.string().optional(),
  seniority: z.enum(['entry','mid','senior','principal','executive']).optional(),
}
```

**Providers** `lib/sourcing/providers/`:
- `linkedin.ts` — Proxycurl Person Search (`/proxycurl/api/v2/search/person`) → for each profileUrl, call existing Proxycurl Person Profile flow (reuse logic from `/api/scrape/thirdparty`). User's Proxycurl key from `user_settings`.
- `jobsdb.ts` — SerpAPI `engine=google` with `q=site:jobsdb.com {keywords}`. If no SerpAPI key in user_settings, fall back to direct Jina Reader on a synthesized search URL (best-effort, may return 0).
- `indeed.ts`, `seek.ts` — exported stubs returning `{ candidates: [], note: 'not_implemented' }`.

**Orchestrator** `lib/sourcing/run.ts`:
```ts
runSourcing({ jdId, userId, platforms, n })
  => AsyncGenerator<SourcingEvent>
```

**Migration `0007_sourcing.sql`**:
- `ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'jobsdb';`
- `ALTER TYPE candidate_source ADD VALUE IF NOT EXISTS 'outbound_sourced';`
- New table `sourcing_runs`: `id uuid pk`, `jd_id uuid fk`, `user_id uuid fk`, `platforms text[]`, `n_requested int`, `n_found int`, `cost_usd numeric`, `status text` (`running|done|failed`), `started_at`, `finished_at`, `error text`, `row_hash text`. RLS: org-scoped via JD→org.
- `ALTER TABLE user_settings ADD COLUMN serpapi_key_encrypted bytea;`

**Settings UI**: extend `/settings/integrations` with a "SerpAPI key (optional, for JobsDB search)" field. Same AES-GCM helper as the Proxycurl key.

## Files to create
1. `lib/sourcing/types.ts`
2. `lib/sourcing/query.ts` — `deriveSearchQuery(jd)` via Claude client
3. `lib/sourcing/providers/linkedin.ts`
4. `lib/sourcing/providers/jobsdb.ts`
5. `lib/sourcing/providers/indeed.ts` (stub)
6. `lib/sourcing/providers/seek.ts` (stub)
7. `lib/sourcing/run.ts`
8. `lib/anthropic/tools/derive_sourcing_query.ts`
9. `app/api/source/run/route.ts` — POST SSE
10. `app/(dashboard)/jds/[id]/source-dialog.client.tsx` + button wiring
11. `app/(dashboard)/jds/[id]/sourcing-history.tsx` — last-5-runs panel
12. `app/(dashboard)/scraper/jobsdb-tab.client.tsx` + wire into existing scraper tabs list
13. `supabase/migrations/0007_sourcing.sql`
14. SerpAPI-key field in existing `/settings/integrations` form (Edit, not new file)

## Out of scope
- Indeed / SEEK live integration
- JobsDB auto-detect from Gmail (Phase 4c)
- Cold email composition / send (Phase 3e)
- Multi-JD batch sourcing
- Persisted reusable search queries / saved searches

## Smoke tests YOU run
- [ ] Open `/jds/<seed-jd>`, click "Find candidates", LinkedIn-only, N=5 → 5 candidates appear in Tracker with `source: outbound_sourced` and a score; SSE events stream in dialog
- [ ] Indeed + SEEK checkboxes disabled with tooltip
- [ ] Cost estimate updates live as N + platforms change
- [ ] JobsDB outbound runs without SerpAPI key → graceful 0 or best-effort result, no crash
- [ ] `/scraper` → JobsDB tab → paste a JobsDB candidate page URL → candidate created with `source: jobsdb`
- [ ] `sourcing_runs` row recorded with `cost_usd`, `n_found`, status `done`
- [ ] Each inserted candidate creates an `/activity` entry + is Undo-able
- [ ] Settings → Integrations shows SerpAPI key field; saved key persists; reloading the page never re-exposes the value

## First action
Confirm with Beam that SerpAPI is acceptable as the JobsDB outbound search backbone (his alternative: skip SerpAPI entirely, JobsDB outbound becomes Jina-Reader-only best effort with no Google search layer — even more lossy). Then build straight through — contracts above are locked.

## Last action (mandatory)
Emit the **Session-done report** described in AGENTS.md → Session-done reporting. Then STOP.
