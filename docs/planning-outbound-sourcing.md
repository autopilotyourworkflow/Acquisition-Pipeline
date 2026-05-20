# Planning session — Outbound candidate sourcing + cold email (replaces Phase 4b)

Paste into a fresh Claude Code chat.

---

I'm continuing the Hotel Plus take-home (`acq.autopilotyourworkflow.com`). Phases 1, 2, 3, Pre-Phase 4 done. AGENTS.md is autoloaded — **trust it as the source of truth; do not re-read it for context.**

## Do NOT do these things
- Don't re-read `cowork-log.md`, library files, or routes for "understanding" — AGENTS.md has the inventory + contracts.
- Don't spawn Explore agents to map the codebase.
- Don't start writing code. **This is a planning session, not a build session.** The deliverables are markdown specs, not files in `app/` or `lib/`.

## What's locked already
- **Phase 4b (cold email) is being REPLACED** by an integrated end-to-end flow. The standalone "draft and send a one-off email" UI from the old 4b plan is out; what survives is the email-generation logic (Opus + a `compose_cold_email` tool def) and the Gmail send wrapper.
- **JDs stay manually entered.** The user creates a JD via `/jds/new` like today. Nothing imports JDs.
- **AGENTS.md autoloads** in every chat that does the actual build work later. Don't suggest a "read this first" preamble in the build prompts.

## What we're planning

Two features Beam wants done before Phase 4a / 4c. Both center on going outbound from a JD instead of inbound from a paste.

### Feature A — Outbound candidate sourcing
**Goal:** with a JD in our database, run an AI-driven sourcing pass that scours the internet for candidates who would plausibly fit the role, inserts them as `candidates` rows tied to that JD, then auto-scores them with the existing screener pipeline.

**Open architectural questions for this planning session:**
1. **Where do candidates come from?** Likely platforms: JobsDB (Thai market, where Hotel Plus actually hires), LinkedIn (via Proxycurl — we already have that integration), maybe Indeed/SEEK profile search. Talk through what's feasible vs. what's wishful. Some of these have anti-scraping protection; some have paid APIs. Beam asked specifically about JobsDB — clarify with him whether he means *search JobsDB for candidates* or whether JobsDB came up as a JD source (he ruled out JD imports — confirm).
2. **What's the query layer?** A JD has a title, must-haves, nice-to-haves. How do we translate that into a sourcing query? Opus call to derive search keywords? Embeddings against a candidate pool? Hand-built rule? Multi-stage (broad search → AI ranking → top-N inserted)?
3. **What's the data shape per candidate?** Reuse the existing `candidates` table (it's flexible — `source`, `source_url`, `linkedin_url`, etc.). Probably need a new `CandidateSource` enum value like `outbound_sourced` to distinguish from manual / pdf / email candidates.
4. **Rate/cost ceiling.** Each sourced candidate hits Claude for scoring + extraction. A JD with 50 sourced candidates is ~$0.50–1.50 in Claude spend. Cap at N candidates per sourcing run? Daily limit per JD? Let the user pick the cap?
5. **UX.** Where's the "Source candidates" button — on the JD detail page? On the candidates Tracker? As a CTA on the screener? Is sourcing a one-shot or a saved background job?
6. **Audit + undo.** Every inserted candidate must go through `withAudit` so the activity log + Undo backbone catches it. Sourcing 30 candidates = 30 audit log entries. Acceptable? Or batched?

### Feature B — Personalized cold email outreach (per sourced candidate)
**Goal:** for any candidate (sourced or manual), draft a personalized cold-outreach email using the JD context + the candidate's resume/profile, let the user edit, then send via Gmail (the same OAuth scope we already have).

**Open architectural questions:**
1. **Send vs draft.** Phase 4b's plan had both. With sourcing in the loop the bias should be toward *draft + review-before-send* — auto-sending dozens of cold emails from sourced candidates is a deliverability and brand-risk problem. Confirm with Beam.
2. **Templating.** Hotel Plus signature? A "from name" the user picks once? Per-JD email tone (formal vs casual)? How much is global vs per-JD?
3. **The compose tool.** Opus 4.7 with a `compose_cold_email` tool def returning `{ subject, body, rationale }`. Body is plain text + light HTML. Goes through `lib/anthropic/client.ts` like every other Claude call.
4. **The send path.** `lib/google/gmail.ts` doesn't exist yet — that's a new file. Uses `gmail.send` scope (already bundled in OAuth login flow per Phase 3a). Per-message rate limiting via Gmail's own quotas.
5. **The DB shape.** Probably new tables `email_drafts` + `email_sends`, or a unified `emails` table with a `status` enum. Migration `0007_emails.sql`. Audit-wrapped.
6. **UX.** A "Compose cold email" CTA on the candidate detail page. Possibly a batch action ("compose for top-5 sourced candidates") — but that's secondary; nail the single-candidate flow first.

## Deliverables from this planning session
1. **A short clarifying conversation with Beam** to lock the ambiguous points above (especially the JobsDB question, the platform mix for sourcing, the cap per run, send-vs-draft default).
2. **Two build-ready prompts**, saved to disk:
   - `docs/phase-3d-outbound-sourcing.md` — Feature A
   - `docs/phase-3e-cold-email.md` — Feature B
   Each ~600–900 tokens, following the prompt-style guide in AGENTS.md ("Writing handoff prompts for OTHER sessions"). Pre-decided contracts inlined. Anti-patterns up top. Explicit file list. Out-of-scope list. Smoke tests. First action.
3. **An AGENTS.md status table update** (proposed as a diff for Beam to approve): demote Phase 4b to ✅ REPLACED with a pointer to 3e; add rows for Phase 3d + 3e between Pre-Phase 4 and Phase 4. Rename Phase 4 to "Phase 4 — AI assists for JD authoring + auto-email-reader" so the remaining 4a / 4c make narrative sense without the missing 4b.
4. **A note on the migration order** if 3e needs a new migration: it would be `0007`, before any of the existing Phase 4 migrations.

## What NOT to do in this session
- Don't write code. Don't create files in `app/` or `lib/`.
- Don't recommend specific NPM packages until Beam weighs in on the sourcing-source question — picking a LinkedIn scraping library before deciding LinkedIn is in scope is wasted work.
- Don't extend scope. Browser extension stays in Phase 5. Multi-attendee FreeBusy stays deferred. Auto-email-reader stays in Phase 4c.
- Don't ask Beam to "approve the plan before you start" — there's nothing to start. Treat this whole session as the plan.

## First action
Ask Beam the three highest-leverage clarifying questions before drafting either prompt:
1. **JobsDB:** is it a candidate source (search JobsDB profiles) or a JD source (the input was a JobsDB job listing)?
2. **Sourcing source mix:** which platforms are in scope for v1 — JobsDB only, LinkedIn (via Proxycurl) only, both, or "AI picks"?
3. **Cold email default:** review-before-send, or auto-send with a confirmation toast?

After those answers, draft the two prompts + the AGENTS.md diff. End the session by printing both prompts in full so Beam can copy-paste into fresh chats.
