# Phase 3b — Scraper MVP (one chat session)

> ✅ **STATUS: SHIPPED in commit `f725968`.** The actual implementation went further than the 3-tab MVP scoped here — all 5 tabs (URL, Paste, PDF, Screenshot, Third-party) shipped. Kept on disk as a *template* of what a thin handoff prompt looks like.

Paste into a fresh Claude Code chat. Phase 3a must have shipped first (OAuth tokens are now persisted — but this session doesn't touch them).

---

I'm continuing the Hotel Plus take-home (`acq.autopilotyourworkflow.com`). Phases 1, 2, and 3a are done. AGENTS.md is autoloaded — **trust it, do not re-read.**

**Task this session:** build Module 1 (Scraper) — but **MVP scope only**: 3 tabs (URL, Paste, PDF). Screenshot + Third-party API tabs are deferred to Phase 5 polish — do NOT build them. Stub them as "Coming soon" placeholder panels.

**Pre-decided contracts (do not deliberate):**
- Single funnel: every scrape path normalizes to the `extract_candidate` tool's output (already defined at `lib/anthropic/tools/extract_candidate.ts`), then hits `lib/scrape/normalize.ts:previewExtraction()` which returns the normalized candidate JSON to the client for editable preview.
- Save path: the user clicks Save in the preview UI → calls the existing `createCandidate` Server Action (`app/actions/candidates.ts`). Set `source` per tab: `linkedin` (URL with linkedin.com host), `jobsdb` (URL with jobsdb.com host), `manual` (URL with other host), `paste`, `pdf`.
- Models: Haiku 4.5 for normalization (cheap, the tool-use does the structuring). Use `callWithTool` from `lib/anthropic/client.ts` (signature in AGENTS.md).
- URL fetch: server-side `fetch(url)` + cheerio for DOM extraction. **Do NOT use a headless browser** — LinkedIn will block, but the markup we can scrape from public-profile HTML is enough to feed Haiku. Accept graceful degradation if a URL returns auth-walled content (toast + suggest paste/PDF as fallback).
- PDF tab: reuse the existing `app/api/attachments/upload` route (already does sha256 dedup + unpdf parsing). The Scraper PDF tab uploads, then calls the new normalize endpoint with the `attachmentId` so it can pull `parsed_text`.

**New dependency:** `npm install cheerio`. That's it.

**Files to create (and only these):**

1. `lib/scrape/normalize.ts` — exported function:
   ```ts
   previewExtraction({ rawText, sourceUrl?, model? })
     => Promise<ExtractCandidateInput & { telemetry }>
   ```
   Wraps `callWithTool` with the `extract_candidate` tool. Returns the structured candidate + telemetry (cost shown in the preview UI).

2. `lib/scrape/cheerio-extract.ts` — `extractProfileText(html: string): string`. Strip nav/footer/script/style, collapse whitespace, return readable text. Pass that text to `previewExtraction` along with the source URL.

3. `app/api/scrape/url/route.ts` — POST `{ url }` → fetch HTML → cheerio extract → `previewExtraction` → return JSON. NO DB write here — just the preview JSON.

4. `app/api/scrape/paste/route.ts` — POST `{ text }` → `previewExtraction` directly. Return JSON.

5. `app/api/scrape/pdf/route.ts` — POST `{ attachmentId }` → look up `attachments.parsed_text` (service-role to allow re-reading any attachment in the org), `previewExtraction(parsed_text)`. Return JSON. Throws 404 if attachment not found.

6. `app/(dashboard)/scraper/page.tsx` — server component, fetches all JDs for the JD-picker dropdown, renders the client shell.

7. `app/(dashboard)/scraper/scraper-shell.client.tsx` — tabbed UI:
   - URL | Paste | PDF | ~~Screenshot~~ (stub) | ~~Third-party API~~ (stub)
   - Each tab has its input + "Extract" button → hits the matching endpoint → renders the editable preview below
   - Preview is an editable grid of fields (Input components from shadcn) backed by the returned ExtractCandidateInput shape
   - Save button → `createCandidate` with `source` set per tab + chosen `jd_id` from the dropdown

8. `app/(dashboard)/scraper/loading.tsx` — match the pattern in `app/(dashboard)/tracker/loading.tsx`.

**Out of scope this session (do NOT build):**
- Screenshot tab implementation (Opus vision call). Stub it.
- Third-party API tab implementation (Proxycurl). Stub it.
- Chrome extension. (Phase 5)
- Auto-email-reader. (Phase 4)
- Any changes to the candidates Server Action — it's already correct.

**Smoke test (before committing):**
- Paste a real CV in the Paste tab → preview populates with name/email/skills/etc → edit one field → Save → candidate appears in `/tracker`
- Run with a public Wikipedia URL in the URL tab (LinkedIn will likely 401 in fetch) — confirms cheerio + Haiku do their job on any HTML
- Upload a PDF in the PDF tab (re-uses the existing dedup-aware upload route) → preview populates → Save

**Don't read:**
- `lib/anthropic/client.ts` — AGENTS.md has the `callWithTool` signature
- `lib/anthropic/tools/extract_candidate.ts` — it's a 30-line zod schema, only read it if you need the exact field names while writing the preview UI
- `cowork-log.md` — only open if writing a new entry

**Cowork-log:** ONE entry covering the single-funnel design decision (every path → `previewExtraction` → editable preview → `createCandidate`). Under today's `*Day 3 — <date>*` marker (or `*Day 3 cont. — <date>*` if 3a already wrote one today).

**First action:** ask me to confirm `cheerio` install + then build straight through. No proposal phase — the contracts above are locked.
