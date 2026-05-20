# Cowork Log

> A record of the decisions I made building the Acquisition Pipeline, and the
> thinking behind each one. AI did the typing on a lot of these; I did the
> deciding. Where the call wasn't obvious, I tried to capture what made me
> pick what I picked.
>
> Read in order — it follows the build narrative.

---

*Day 1 — 2026-05-18*

## 1. Five days, "any stack," no hand-holding

The brief said *any stack, no restrictions*. That's the dangerous kind of freedom — every modern framework has a defensible answer, so the choice is really about what lets me ship the most surface area in five days without compromising review-ability.

I locked in **Next.js 16 App Router + Supabase + shadcn/ui + Tailwind v4 + Claude (Opus + Haiku)**.

The two non-obvious calls:

**Supabase over rolling my own auth/DB layer.** Supabase pushes "same-org-only" enforcement to the database via Row Level Security, not into a middleware layer that depends on app-code discipline to stay correct. A reviewer can open `0001_init.sql` and see that data isolation is *mathematically guaranteed*. With Prisma + NextAuth, isolation depends on every API route remembering to filter by `org_id`. One forgotten filter = leak.

**Two Claude models, not one.** Opus 4.7 for the scoring endpoint where output quality directly maps to the 15% AI grade. Haiku 4.5 for the cheap, high-volume work of normalizing scraped HTML into structured candidate records. Different price/quality tradeoffs deserve different models — and the prompt-caching wrapper in `lib/anthropic/client.ts` makes both efficient.

What I rejected: T3 stack (tRPC felt overkill at this size), Prisma + NextAuth (more seams), and Cloudflare Pages hosting (the Node-only paths for PDF parsing and Gmail SDK don't run cleanly on edge).

---

## 2. URL topology: subdomain over subpath

I owned `autopilotyourworkflow.com` on Cloudflare already. When the time came to deploy, the obvious instinct was `autopilotyourworkflow.com/acquisition-pipeline`.

Wrong instinct.

A subpath would force Next.js `basePath` configuration, OAuth redirect URIs that include the path segment (more fiddly to keep straight in three different Google Cloud screens), and Cloudflare transform rules to route the path to Vercel. That's a maintenance tax compounding for the lifetime of the project.

`acq.autopilotyourworkflow.com` instead. One CNAME record. Clean OAuth. Cookie scope isolated from anything else on the root domain. Future-proof for adding `invoice.`, `crm.`, etc. under the same brand later.

**The insight that flipped me:** registrar, DNS, and hosting are three independent layers. Most people conflate Cloudflare and Vercel as competitors; they're not — Cloudflare resolves names, Vercel runs the app. Keep both. The CNAME is just the bridge.

---

## 3. Brand register: terracotta over gold

Hotel Plus is hospitality consulting. The lazy choice for a hospitality SaaS palette is **gold accent on white** — every five-star hotel chain's marketing site uses it.

But gold at SaaS-CTA scale reads "casino loyalty card" or "Trump Tower." It's a tightrope.

I went with **terracotta `#BD5B3C`** instead. It channels Thai temple roofs, Aman/Capella's brand language, restored Bangkok shophouse brick. It's *unmistakably hospitality* without being kitsch — and in a SaaS market saturated with blue and purple, it makes us look different from the first frame.

One accent only. Used for CTAs, focus rings, active states, and the H+ monogram. Never gradients. Never combined with gold.

The boring half of this decision: every other surface is navy + cream + warm neutrals. The brand "pop" lives in *one* color, used sparingly. Restraint is the design language.

---

## 4. Identity ≠ delegated permissions

Standard SaaS auth pattern: "Sign in with Google." Done.

But two overdelivery features — Calendar coordination and Gmail-drafted cold emails — need Google API scopes (`calendar.events`, `gmail.compose`, etc.). The naive design is to request all of those scopes at sign-in. Now every HR user who wants to *just look at the app* has to grant Google permission to read their calendar and write emails on their behalf. That's a hostile first impression for a privacy-conscious user.

I split it into two phases:

1. **Sign-in** supports either Google OAuth (just `openid email profile`) **or** email + OTP code (no third-party data sharing at all).
2. **Calendar and Gmail scopes** become *per-scope toggles* in Settings → Integrations, requested only when the user opts in.

Features degrade gracefully when scopes are missing. No Calendar connection → the user shows as "external invitee" in the scheduler, no FreeBusy query against their calendar. No Gmail connection → the email composer offers "Copy to clipboard" + a `mailto:` deep link instead of "Send via Gmail."

The pattern: **what you are** (identity) is separate from **what you let the app do on your behalf** (delegated permissions). Conflating them is lazy auth design.

---

## 5. Multi-user dynamics: audit log + per-user undo

This started as a thought experiment: what happens when two HR teammates both edit the same candidate in the same minute?

The minimum-effort answer is "last write wins, hope for the best." But that's how recruiting tools lose people's notes and frustrate teams into spreadsheet workflows.

The maximum-effort answer is full operational transformation / CRDT. Not for a 5-day take-home.

The middle path: **every mutation writes to `activity_log`** (actor, action, before, after, SHA-256 hash of the after-state). That gives the team a full audit trail for free. Then I added **per-user undo/redo over your own last ~20 actions within 30 minutes**, with a conflict-detection step: when you click Undo, the server compares the current row's hash to your action's `after_hash`. If they differ — someone changed it after you — you get a "row changed since your action — undo anyway?" prompt with a diff.

Undo a teammate's destructive operation? Not without confirmation. Undo your own typo from 2 minutes ago? Instant.

This is the kind of feature that doesn't show up in screenshots but transforms how teams trust the tool.

---

## 6. Encrypting OAuth tokens: Node-side, not Postgres

Standard advice for storing OAuth refresh tokens is "encrypt with pgcrypto." That works, but it requires either:

- Setting a Postgres-level GUC variable holding the encryption key (which lives in the DB), or
- Using Supabase Vault (extra service to configure)

In both cases, the key material ends up *inside* the same system that stores the encrypted data. Co-locating ciphertext and keys is one of those security smells that's defensible but not great.

I moved encryption to Node. AES-GCM with a key from `OAUTH_ENCRYPTION_SECRET` (env var, never touches the database). The database stores opaque `bytea` blobs. A database compromise alone — without compromising the running app's process memory — yields nothing useful.

It's a small thing. But it's the kind of small thing that shows up on a code review and tells the reviewer the author thought about the threat model, not just the happy path.

---

## 7. The magic-link pivot: when to stop fighting the platform

I designed the email login as a 6-digit code paste-in flow. Built the UI. Wrote the verifier endpoint. Tested.

Supabase's default Magic Link template doesn't render `{{ .Token }}` — it renders `{{ .ConfirmationURL }}`. The email I received had a link, not a code. The fix is to edit the template in Supabase's dashboard. Easy, except the template editor has a per-template "Save" button at the bottom that's easy to miss, and my first save attempt didn't take.

**The forced choice:** fight the template until the code shows up, or accept the magic-link flow Supabase sends by default.

I picked: do both. The email template ended up rendering both code and link. The form's primary path is still the 6-digit code (cleaner UX, B2B SaaS muscle memory). But the form also tells the user "Or click the sign-in link in your email — both paths work." Either flow lands in `/auth/callback` and gets signed in via the same PKCE exchange.

**The bigger lesson:** when a platform's default flow already works, ship it and put your engineering minutes somewhere a reviewer will notice. The login form is *one* small surface; the AI scoring endpoint is the 15% grade.

---

## 8. Production deploy: rotate before, not after

When it came time to deploy, my Supabase keys had been pasted in chat earlier in development. They were live, working — but compromised. Anyone with the chat log could read or write my database with the service-role key, which bypasses every RLS policy.

The instinct is "I'll rotate later, it's just dev." But "later" means rotating *twice*: once for the keys in dev, once for the keys you just pushed to Vercel.

I rotated **before** the Vercel deploy. New `anon` + `service_role` keys, paste into `.env.local`, paste into Vercel's env-var import dialog. One rotation cycle, one set of values in two places, no window where production runs on leaked credentials.

The same principle applies at the end of the project for the **Final Phase secrets audit**: rotate everything one last time before the repo flips public for review. Don't rely on `.gitignore` discipline alone. Don't rely on chat-log discretion. Rotate, run `gitleaks` against the history, and ship clean.

---

*Day 1 — 2026-05-18*

## 9. Foundation contracts: thin HOFs over middleware sprawl

How much abstraction is the right amount for the two wrappers everything else depends on?

The audit log and the Claude client are both on the critical path. Every mutation goes through one; every AI call goes through the other. The temptation, when something is this load-bearing, is to over-engineer: middleware chains, decorator metaprogramming, plugin hooks. All of those make the framework feel cleaner and make individual call sites confusing.

I went thin both places. `withAudit` is a single higher-order function: takes the actor, the table, the before-state, and a closure that does the actual mutation. It computes the after-hash, writes the audit row, returns `{ after, logId, afterHash }`. The whole thing is ~80 lines. The call site reads top-to-bottom — there's no magic.

The Claude wrapper is the same shape: one `callWithTool` that does retry + cache + telemetry + tool-use forcing, and one `streamWithTool` for UX-critical surfaces. Tool definitions are zod schemas with a `validate` function, so the call site gets typed values back, not `unknown`. Telemetry is *returned* — the caller decides where to persist it, no surprise side effects.

The one non-obvious move: the audit insert uses the service-role client (the `activity_log` table has SELECT-only RLS — writes from a user-scoped client would be denied), while the actual mutation runs on whatever client the caller closes over. That asymmetry is documented at the top of `lib/audit/wrap.ts` so the next reader doesn't have to reverse-engineer the reasoning.

**A foundation file that needs a wiki page to use isn't a foundation, it's a tax. Keep wrappers narrow enough to read in one sitting.**

---

## 10. Scoring prompt v1: anti-bias as a quality lever

The 15% AI grade lives almost entirely inside one prompt. What goes in it?

The naive version is "rate this CV against this JD on skills, experience, culture, 0-10 each." That gets a score. It also gets the model's full set of priors about which schools matter, which name origins feel "professional," which career arcs read as ambitious. None of that is what a hiring team wants from a screening tool.

So v1 leans into anti-bias as an *explicit* instruction, not an implicit hope. The system prompt names the things to **discount** (school prestige, gender markers, name origin, birthplace) and the things to **weight** (demonstrated work, project specificity, ownership). That's both the right thing to do for an HR tool and a quality lever — it forces the model to look at concrete claims in the CV instead of pattern-matching to prestige signals.

Two other moves matter. Every score's reasoning has to cite a specific line of the CV — reduces hallucination, makes the rationale spot-checkable. And the rubric anchors at 3 / 5 / 7 / 9 are explicit ("3 — clear miss; 7 — solid match; 9 — exceptional fit"), so two different runs converge on the same numeric scale rather than drifting.

Output is forced through the `submit_score` tool — never free text. That makes the response shape contractual, makes telemetry honest, and lets us version the prompt (`scores.prompt_version = 'scoring.v1'`) so when v2 ships we can A/B against v1 on the same JD+CV pair.

The smoke test against the seed JD with a synthetic Bangkok-based candidate returned 9 / 8.5 / 8 → 8.60 weighted in 26 seconds at $0.16. The reasoning quotes "40% FRT reduction" and "Ruby→TypeScript migration" — verbatim phrases from the CV. That's the grounding clause earning its keep.

**The prompt is product code. Version it, ground it in evidence, write the anti-bias clauses out loud.**

---

## 11. Stream the tool, not the spinner

An Opus 4.7 scoring call takes 25-40 seconds. How should the UI reflect that the model is working?

The lazy choice is a spinner. A spinner makes 30 seconds feel like five minutes — the user has no signal anything is happening, and the model could be stuck for all they know.

The other extreme is to parse the streaming tool input as it arrives and live-update the score bars. That fails on a real engineering basis: the streamed JSON is invalid until the very last token. You'd need a tolerant partial-JSON parser, and even then you're showing numbers that might change in the next 500ms. Pretending you have a number when you don't is worse than admitting you don't.

The middle path: stream the raw tool input — the JSON-as-it-types — into a small monospace box on the ScoreCard. The user watches the JSON keys appear, then the score values, then the prose reasoning. It's honest: the model is generating, here's what it's saying, and when it's done the formatted card replaces the stream.

Implementation is SSE-frames over a POST handler. `score_partial { text: <accumulated_tool_input> }` per delta, `score_complete { scoreId, value, telemetry, weighted_total }` on stream close. The client uses `fetch` + `ReadableStream` rather than `EventSource` (POST isn't supported by the latter), but the wire format is still SSE-conventional so the server stays simple.

One detail that earned itself: `max_tokens: 8192` (not 4096) plus a "150-250 word hiring_report" cap in the prompt. The first attempt with 4096 succeeded once and failed once — the model was non-deterministically verbose enough to truncate the JSON before the last field. Headroom + a length cap on the verbose field fixed it.

**Honesty beats theatre. If you can't show the user real progress, show them the real work.**

---

---

*Day 2 cont. — 2026-05-19*

## 12. Default to Haiku, expose Opus — and turn the temperature down

After yesterday's smoke tests I went looking at the bill and got uncomfortable. Opus 4.7 was the right showcase model for the AI grade, but it's the wrong default for *iteration*. Every "let me retry the wording of this prompt" cost ~$0.16 and 30 seconds. That's a tax on getting better.

Switched the default to **Haiku 4.5** and surfaced both models in a UI dropdown on the screener. Haiku at temperature 0 returned an identical 8.60 weighted total on the same synthetic candidate as Opus did — for $0.009 in 15 seconds. ~27x cheaper, ~2x faster. For early-stage screening (which is what this whole module *is*), the Haiku output is indistinguishable from the Opus one in terms of decision usefulness. Opus is one click away when the user wants the more careful read.

The temperature change is the unglamorous one but might be the biggest stability win. Set `temperature: 0` as the default in `lib/anthropic/client.ts` for all tool-use calls. LLMs are non-deterministic by nature, but temperature 0 collapses most of the variance for scoring tasks. The user had reported the same CV+JD giving different scores between runs — that was the temperature default at work. Now those repeat runs converge on near-identical scores.

The next layer of stability — if needed — is the ensemble pattern: three parallel scoring calls, take the median, have a fourth call write the report. Costs 3-4x but produces statistically stable scores. Holding that for Day 5 polish; temperature 0 should cover us until then.

**Cheap is not the same as worse. Pick the smallest model that does the job, then make it easy to escalate.**

---

## 13. Telemetry on the failure path

The user noticed that when scoring fails (Claude's tool output failed zod validation — model truncated the JSON), the UI just shows the validation error. But the API call already succeeded — tokens were paid for. The cost vanishes silently.

That's exactly the kind of thing that erodes trust in your own observability. "I clicked the button, it broke, where did my $0.30 go?"

Added a `ClaudeValidationError` class that wraps the zod issues but *also* carries the telemetry from the (successful, expensive) underlying API call. The route handler catches it specifically and emits a `score_error` SSE frame that includes the model, input/output tokens, cache stats, and the dollar cost. The ScoreCard error UI now renders that as a small "Tokens were spent — here's what it cost" panel below the error message, with a collapsible "Show what Claude actually returned" detail for debugging the truncation.

This is one of those features that doesn't add value when everything works. It adds enormous value the moment something doesn't, because the user can see whether the failure was free (network) or expensive (validation), and act accordingly — escalate to Opus, shorten the JD, whatever.

**A failure mode without telemetry is a failure mode you'll fix the wrong way.**

---

## 14. Lift the optimistic state, or watch it disappear

Dragging a candidate card to a new column was working — until you switched to Table view mid-drag. The card would reset.

The cause: `useOptimistic` lived inside the Kanban component. When you switched views, Kanban unmounted, the optimistic state went with it, and Table received the (still-stale) server-fetched candidates. The server `revalidatePath` does run, but lazily — sometimes after the view switch had already happened.

Fix: lifted the candidates state out of Kanban and into the parent `TrackerViews` component. Both Kanban and Table now read from the same source. Drag-drop mutates the parent state synchronously, then the Server Action runs in a transition, and on success the parent calls `router.refresh()` to background-sync with server data. On failure: revert the parent state to the snapshot taken before the drag, toast the error.

It's a more honest pattern than `useOptimistic` for this case — that hook is great when you have a single source of truth that React itself can reset for you, but our reality has *two views* reading the same data. Shared state with manual revert is the right answer.

**`useOptimistic` is a hook, not a discipline. The discipline is "wherever your data is visible, your optimistic update has to be visible too."**

---

## 15. The prompt is the product — make it editable

Hardcoding `SCORING_SYSTEM_PERSONA` in `lib/anthropic/prompts/scoring.v1.ts` was fine for getting started. But the user is going to want to iterate on that prompt the way you iterate on a landing-page headline: tweak, score a candidate, compare, tweak again. Forcing a code change + redeploy for every iteration is the wrong loop.

Built `/settings/prompts`. New table `scoring_prompts` (version, persona_text, is_active, created_by, created_at). Editing the textarea and clicking "Save as new version" creates a new row, deactivates the old one, and the next score will use the new persona. The route handler now loads the active prompt from the DB at call time (with a fallback to the hardcoded constant if the migration hasn't been applied yet — never break scoring because of a settings page outage).

Versioning matters here. `scores.prompt_version` continues to record whichever version produced each row, so when v3 lands you can A/B against v2 against v1 on the same JD+CV pair. The version label auto-increments (`scoring.v1` → `scoring.v2` → `scoring.v3`) by parsing the existing rows.

The interesting design decision was *what* to make editable. Just the persona — the structural prompt pieces (the cacheable JD block, the user-message containing the CV text) stay in code. Those affect the prompt-cache key and the streaming protocol; they're not what a non-engineer should tune. The persona is the part that drives bias, rubric, voice, tone — exactly the right edit surface.

**Iteration speed is a product feature. Hardcoding the prompt was a Day-1 shortcut; turning it into a stored, versioned, editable artifact is the real shape.**

---

## 16. Same file? Same hash. No tokens.

The screener has a CV upload. The user pointed out: if they accidentally remove and re-upload the same PDF, do we re-parse and re-score-from-scratch? Today, yes. That's a waste.

Added a `content_hash` column on `attachments` (sha256 of the file bytes). The upload route now hashes the buffer first, looks up an existing attachment with the same hash for the same candidate, and short-circuits if found — returns the cached attachment id and parsed_text length, with `reused: true` so the UI can show "Same PDF detected — reused cached extract" instead of "CV uploaded + parsed."

Cost analysis: PDF parsing itself doesn't use AI tokens — `unpdf` is pure Node, costs $0. But the bytes upload, the storage write, and the parsing CPU all add up. More importantly, the Anthropic prompt cache *only* hits when the exact same text reaches Claude — so reusing the same `parsed_text` row is what makes the JD-body cache write from an earlier scoring run still hit on the next run for the same CV.

Markdown vs plain text for the cached extract: roughly equivalent on token count, plain text is fine. The structure already comes through from the original CV's layout when unpdf preserves paragraph breaks.

**Dedup is the cheapest cache. Hash the bytes, skip the work.**

---

---

## 17. Bundle the scopes — reversing a Day-1 call

The original auth design separated identity ("who you are") from delegated permissions ("what the app does on your behalf"). Sign in with `openid email profile` only, grant Calendar / Gmail later in `/settings/integrations`. I thought it was the right move at the time — gentler first impression, supports email-OTP users who never want to grant Google API access.

Reversed it. For *this* product — a recruiting tool where 100% of HR users will end up wanting Calendar and Gmail — the decoupling was theoretical politeness at the cost of real UX friction. The user pointed it out: why are we asking them to grant Google access twice? At sign-in for identity, then again later for each scope? It's two flows, two consent screens, two trips to settings.

So Google sign-in now requests `openid email profile calendar.events calendar.freebusy gmail.compose gmail.send` upfront, with `access_type=offline` + `prompt=consent` to guarantee a refresh token. One scary-looking consent screen instead of two underwhelming ones. Email-OTP users still skip all of this — they just lose Calendar/Gmail features until they connect Google later, same as before.

What this teaches me: "principled" design choices that the user would have had no opinion about can become drag the moment you describe them. The principle (identity vs delegated permissions are different) is correct. The application (force every user through two flows to express it) was wrong for this scale of product.

**A separation of concerns the user doesn't feel is just two clicks.**

---

## 18. Scoring teams: 3 + 1, parallel, manager consolidates

The user has been worried about score stability since v1 — same CV+JD shouldn't give different numbers on different days. Yesterday's fix was `temperature: 0`, which collapses ~90% of the variance. The user wanted the rest of it: a real team-mode toggle so high-stakes scoring runs are robust.

Built three scorer agents that run in parallel at temperatures 0, 0.3, and 0.6, all using the same active scoring persona. The temperature spread is the *only* source of variation — same prompt, same JD, same CV. Each one produces a full `submit_score` output independently. Then a manager agent (its own system prompt, hardcoded for now) consolidates: median when the three agree, evidence-weighted when they don't, deduped strengths/gaps, best-of prep questions, one unified hiring report.

Cost is ~4x a single call (3 scorers + 1 manager). With Haiku at ~$0.04, that's still a rounding error for HR work. With Opus at ~$0.80, you'd reserve it for final-round decisions.

What I deliberately didn't do: vary the persona across the 3 scorers ("skeptical", "optimistic", "neutral"). The temptation was real — diverse perspectives would make the manager's job juicier. But that turns into a prompt-engineering hairball, and we'd lose the ability to A/B the persona uniformly. The temperature spread alone produces enough variance to make the manager pass meaningful, and it keeps the source of truth (the active persona) clean.

The UI shows each agent as a row with a live status indicator (running → done → cost displayed). Failures degrade gracefully: if 1 of 3 scorers errors, the manager runs with 2; if 2 fail, we abort with a clear message. Per-agent telemetry lands in `scores.team_agents` JSONB for traceability.

**Variance is not a flaw of LLMs; it's a feature you can harness if you average across it. Three at different temperatures is the cheapest valid sample.**

---

## 19. Loading skeletons aren't decoration — they're the perceived speed

The user reported pages feeling slow. Cold-start latency on Vercel free-tier is real (1-3 seconds for a serverless function that hasn't run recently); paid tier keeps them warm but that's an infrastructure call, not a code one.

What I *can* do from the code side: render the page shell instantly while the server is still fetching data. Next 16's `loading.tsx` convention does exactly this — when you navigate to `/tracker`, the loading.tsx renders immediately on the route segment, replaced by the real page only when its async data resolves.

Added skeletons for `/tracker`, `/jds`, `/screener`, `/activity`, `/settings`, `/settings/prompts`. Each one is hand-tuned to roughly match the real layout — Kanban columns for the tracker, table rows for the activity feed, a textarea-shaped box for the prompt editor. Reduced-motion media query disables the pulse for users who've asked for it (already wired globally in app/globals.css).

The fix isn't faster server. The fix is the user not staring at white space.

**The page that renders in 50ms doesn't *exist* faster — it *feels* faster, which is what matters.**

---

## 20. Pull basic Undo forward — the audit log was getting jealous

The user clicked through to `/activity`, saw the rows accumulating, and asked the question I expected to come on Day 4: "Where's the Undo button?"

Built it. Day-2 simplification (no conflict detection yet): `POST /api/audit/undo { logId }` fetches the audit row, applies the inverse mutation via the service-role client (insert → DELETE, update → UPDATE before, delete → INSERT before), marks the original row `undone_at`+`undone_by`, then inserts an inverse audit row pointing at the original via `redo_of`. The activity page renders an Undo button on entries less than 30 minutes old, hidden once a row has already been undone (or is itself an undo entry).

What's missing vs. the full Day-4 plan: conflict detection. If someone else has changed the row since this action, the current code happily reverts to the original `before` — clobbering their work. Day 4 will compare the current row's hash to the action's `after_hash` and prompt the user with a diff before clobbering.

For Day 2 demo purposes, with one user at a time, this is fine. The audit log finally has interactivity.

**A read-only audit log is a museum. Add Undo and it becomes a tool.**

---

---

## 21. Score history without a new page

The user wanted to come back to a previous score without re-running it. Two valid designs: a dedicated `/scores` list page, or fold the history inline on the screener itself.

I chose inline. The screener page server-fetches all `scores` rows on load (`order by created_at desc`), passes them down, the shell filters to the selected candidate+JD pair. Latest score auto-renders as a full ScoreCard; older runs collapse into a clickable list below. Pick any past run → swaps the displayed ScoreCard to that snapshot.

The lift was small — one extra Supabase query, one passdown prop, one collapsible component. The win is that the user lands on the screener and immediately sees "here's where you left off" instead of "click Run to regenerate everything." Each row in the history list shows weighted_total, date, model, mode (single/team), and prompt version — enough metadata to spot which run was a calibration test versus the real one.

What stayed out: a dedicated /scores route, score diff between runs, exporting history to CSV. All defensible later; none load-bearing for the demo.

**Persisting the artifact is not the same as exposing it. The scores table was already complete — the missing piece was the third sentence on the screener page.**

---

## 22. Per-JD prompt override — the right escape hatch

The global scoring prompt at `/settings/prompts` is fine for one role. Hotel Plus will hire across engineering, ops, F&B, revenue analysis — and the same anti-bias clause ("discount school prestige") that's right for engineers is wrong for academic-research roles where credentials genuinely matter.

Added `scoring_persona_override` as a nullable text column on `job_descriptions` (migration 0004). JD editor gets an expandable "Advanced — custom scoring persona for this role" section, collapsed by default. Empty = use the global. Filled = override only this JD's scoring runs. `scores.prompt_version` records `jd-<id>:custom` when the override fired, so old scores stay traceable.

What I deliberately didn't do: build a separate `jd_prompts` versioning table. JDs already version via `withAudit` (every JD edit is in the activity log with before/after). Doubling that into a second history table is over-engineering for a single-org take-home.

The override is empty by default. That matters — most users won't touch it, the global prompt does fine. But for the one role where the global is wrong, this is the lever.

**Configurable defaults are powerful. Hidden-by-default configurability is powerful AND humane.**

---

## 23. UndoToast — the Linear pattern

Sonner toast with an "Undo" action button, 30-second duration, after every drag-drop stage change. Click the toast → `POST /api/audit/undo` → server reverts → client reverts the optimistic state → "Reverted" confirmation. No need to navigate anywhere to undo a fresh action.

This is the affordance Linear made famous: every destructive action is followed by a brief window of "wait, that wasn't what I meant." When the window passes, the toast disappears — but the action is still revertable from `/activity` (any age, post-round-5).

Implementation: `updateCandidateStage` Server Action already returned the `logId`. The drag handler caught that, embedded it in the toast's action button, and the click handler did the inverse fetch + state restore. Around 20 lines net.

The /activity page got a parallel polish: it now shows the Undo button for ALL non-undone entries (any age). Originally I'd capped this at 30 minutes thinking it was a safety thing, but the real safety lives in the Day-4 conflict detection (hash compare + diff prompt). Until that ships, trust the user.

**A Day-2 product needs Day-2 undo. Day-4 polish is the safety net, not the gatekeeper.**

---

## 24. The candidate detail page — where the product becomes browsable

Kanban cards and Table rows were visually rich but functionally dead — you couldn't click anything to dig in. The screener page knew about scores but only the *current* selection. Activity knew about audit but not who the candidate was. The product was a set of strong components without a connecting tissue.

Built `/candidates/[id]`. Server-fetches candidate, all scores grouped by JD, all attachments. Renders a contact panel, a notes block, attachments with parsed-text chars cached, and scoring history grouped by JD (latest expanded, previous collapsed). One CTA: "Run a new score" → bumps you to the screener with `?candidate=<id>` pre-selected.

Made Kanban cards and Table rows clickable to navigate here. The Kanban click had to disambiguate from drag — dnd-kit's 5px activation distance handles the gesture difference, plus a pointer-movement tracker decides whether to navigate on pointer-up.

Latest weighted score badge on every card and a Score column on the Table — color-toned (green ≥8, warning ≥6, danger <6). The reviewer now sees who's hot at a glance without opening anything.

This is the most graded change in the round. UX is 25% of the rubric, and "I can click on a person and see their whole story" is exactly the moment a reviewer thinks "yes, this is a real tool, not a demo."

**A scorecard is not the product. The product is what the user does between the scorecards.**

---

## 25. Phase 4 plan: AI prompt-builder interview

A short-version-of-an-entry to mark a planning decision, not a build.

The per-JD prompt override (entry 22) is powerful but cold-start hostile — most HR users won't know how to write a good scoring persona from scratch. The fix: an AI-driven interview that asks 4-6 focused questions about the role and drafts the persona for them. Click "AI-assisted: help me write this" on the JD editor → Haiku conversational dialog → tool call → pre-filled persona for review → save.

Sketched the full architecture (endpoint, tool, prompt, UI component) into AGENTS.md so the next session picks it up. Slotted into Phase 4 alongside the auto-email-reader and cold-email pipeline — both are "AI assisting setup" overdelivery features.

**Write the plan when the reasoning is fresh. Implementation can wait; the design decision shouldn't.**

---

*Phase 2 complete. Decisions ahead in Phase 3 — Module 1 (Scraper) is the heavy lift: URL fetch + cheerio, paste, screenshot + Opus Vision, third-party API (Proxycurl). Module 4 (Scheduler basics) is smaller: persist the Google refresh token, single-attendee Calendar event with auto-prep-questions in the description. Phase 4: cold-email pipeline, multi-party FreeBusy, AI prompt-builder interview, auto-email-reader, undo conflict detection, Team / Invite flow. Phase 5: Chrome MV3 extension, ⌘K palette, seed demo data, Loom recording. Final phase: secrets audit + flip-public.*

---

*Day 2 — 2026-05-19*

## 26. OAuth token persistence: refresh token rotation and revocation

How do we handle Google's refresh token after it's granted at sign-in? And what if the user revokes the app later?

Built `lib/google/oauth.ts` with AES-256-GCM encryption (Node-side, key from `OAUTH_ENCRYPTION_SECRET` env var). The design:

- After `exchangeCodeForSession`, grab `provider_token` + `provider_refresh_token` from the session.
- Encrypt the refresh token (`iv || authTag || ciphertext`), store as `bytea` in `oauth_tokens.refresh_token_encrypted`.
- `getGoogleAccessToken(userId)` returns current token if fresh (>60s left), else hits Google's token endpoint to refresh.
- Refresh race condition: two concurrent requests both see `expires_at < now` and hit the endpoint. Both refreshes valid, last writer wins via atomic upsert — no locking needed.
- Revocation: Google returns `invalid_grant` → delete the `oauth_tokens` row → return `{ ok: false, reason: 'revoked' }` → caller shows "Reconnect" CTA.

The encryption at-the-Node level (not pgcrypto) means a database-only breach yields nothing useful — the key never touches Postgres. This is the same reasoning from cowork-log entry #6 (earlier entry on this project), applied to refresh tokens instead of session secrets.

**OAuth tokens are a trust asset. Encryption is about threat models, not just defense-in-depth.**

---

## 27. Single normalize path for the scraper

The scraper has 5 input tabs (URL, paste, PDF, screenshot, third-party API). Do they each get their own Claude call, or is there a single shape?

Built `lib/scrape/normalize.ts:normalizeCandidate()` as the single funnel. Every tab:
1. Extracts or fetches raw text (HTML → cheerio, URL → fetch, PDF → unpdf, screenshot → Opus vision, Proxycurl → JSON).
2. POSTs to an SSE endpoint that calls `normalizeCandidate()`.
3. Client gets back structured `ExtractCandidateInput` (full_name, email, phone, skills[], experience[], education[]).

The single Claude call means:
- One prompt, one set of guidelines, one rubric for what "extract" means (facts-only, no invention).
- Each endpoint's test data is *consistent* — if URL extraction misses something, that bug shows up in all 5 endpoints because they call the same normalization.
- The tool schema is `extract_candidate` (scaffolded in Phase 2) — no new tool definitions.

Haiku by default ($0.009/call), Opus on demand if the user toggles it. Temperature 0 for determinism.

**The normalize function is the contract. Once it's solid, all tabs are solid.**

---

## 28. HITL preview in the scraper — trust, but verify

After extraction, show all fields as editable text inputs before saving. User can:
- Fix typos (Claude extracted "Sennheiser" as "Senheiser").
- Add missing context ("Director of People Ops → VP People" after reviewing the extracted title).
- Ditch low-confidence extractions (email looks wrong → delete it).

This is Human-In-The-Loop at its lightest. No approval workflow, no second-review gate — just a one-touch correction pass. The user reviews the extraction instantly, patches what matters, then saves.

Without this, cold-start confidence in the scraper would be low (even if extraction is 95% accurate, that 5% error rate is visible on every import). With it, users trust the system — they're not blindly saving extracted records.

Implementation: preview panel is a grid of text inputs bound to extracted fields. Save calls `createCandidate()` Server Action directly with the edited data.

**Extraction confidence is a product feature. Make fixing errors frictionless and extraction becomes a tool, not a lottery.**

---

*Phase 3 foundation (OAuth + Scraper API) complete. Next: Scheduler (Step 2) + Settings/Integrations (Step 3).*

---

*Day 3 — 2026-05-20*

## 29. Graceful degrade for email-OTP users

The Scheduler module needs Google Calendar access — that's the whole point. But what about users who signed in via email OTP and never granted Google scopes? Three options on the table:

1. Block them at the route level and force a re-auth.
2. Let the call to Google fail and surface a generic 500.
3. Show a clear empty state that explains what's missing and links to the fix.

Went with #3. The `/schedule` and `/settings/integrations` pages both check `oauth_tokens` for the current user. No row → "Sign in with Google" CTA. Row exists but missing the `calendar.events` scope → "Reconnect to grant Calendar" message. Features never 500 — they hide themselves and tell the user exactly why.

This decision plays out across the whole app. Phase 4's Gmail-based features will follow the same pattern: check `oauth_tokens.scopes[]`, render an empty state if a needed scope is missing. The `/settings/integrations` page becomes the single source of truth for "what can this user do?" — every feature defers to it for permission checks.

A nice side effect: testing in different auth states isn't terrifying. Email-OTP users see a friendly empty state and a clear path to add the scope. No mysterious 500s, no "what does this error even mean?" support tickets in production.

**Features should ask permission, not assume it. The integrations page is the registry; features are subscribers.**

---

## 30. The calendar invite is for the candidate, not the interviewer

Initial Scheduler shipped with prep questions auto-attached to the Google Calendar event description. Looked great in testing — until I realized the candidate gets the invite too. They'd see *interviewer prep questions* in their own calendar.

Hard rework. The description template is now for the candidate's eyes:

```
Hotel Plus – Interview Invitation
Position: ...

Candidate: ...
Phone: ...
E-mail: ...
CV: <signed link>
Portfolio: ...

Interviewer:
Hotel Plus Recruitment Team / Automation Team

Should you require any additional information…
```

Prep questions still exist — they live on the candidate detail page, and the schedule form previews them with a banner that explicitly says "interviewer-only, not sent to candidate". That separation is structural, not stylistic: anything in `events.description` ships to all attendees, full stop.

Also: empty fields drop their entire line instead of rendering "Phone: —". An invite with three out of six fields looks intentional; an invite with three filled + three em-dashes looks broken.

**Audience awareness goes into the data model, not just the prompt. If a candidate sees it, write it for the candidate.**

---

## 31. Schedule-X v4 was a stack-pinning lesson

Picked Schedule-X for the calendar view after weighing it against FullCalendar (smaller bundle, easier to brand-match with CSS variables, modern API). `npm install @schedule-x/...` without a version range pulled v4.6 — the latest. v4 had silently switched to the Temporal API: events take `Temporal.ZonedDateTime` objects instead of strings, `defaultView` was removed, `selectedDate` requires a `Temporal.PlainDate`. Our code, written for the v2 string-based API I'd pitched, threw at render time. Vercel's `/schedule` page returned 500 with no obvious cause.

Pinned to `^2.36.0` explicitly and the page rendered immediately.

Two takeaways. One: a library that releases a paradigm shift in a major version is doing the right thing semver-wise — the breaking change is signalled. But `npm install <pkg>` defaults to latest, which means the version drift is invisible at install time. Always pin majors when introducing a new dep, especially mid-project.

Two: when a page returns 500 with no logs, the cause is usually a runtime-only crash inside a component, not an infra issue. The fix path is `npx tsc --noEmit` (catches type drift) then `git log --oneline package.json` (catches dep drift). I went straight for the second after realizing types weren't catching this — peer-dependency mismatches don't always trip tsc.

**`^x.y.z` and `latest` aren't the same when the registry has a new major. Pin until you've read the changelog.**

---

## 32. PostgREST and binary columns don't speak Buffer

The OAuth refresh token gets encrypted with AES-256-GCM (`iv || authTag || ciphertext`) and stored in `oauth_tokens.refresh_token_encrypted` as `bytea`. The first cut passed the resulting `Buffer` directly to supabase-js's `.upsert()`. The row inserted without error, signing in worked, scheduling worked — for about an hour.

When the access token expired and the code tried to refresh via the encrypted refresh token, decryption failed with "Unable to authenticate data". The `octet_length` of what was stored was 496 — way too big for a ~100-byte plaintext + 28 bytes of IV+tag. Working backwards: 496 is exactly the byte count of the JSON literal `{"type":"Buffer","data":[1,2,...,140]}`. supabase-js had JSON-serialized the Buffer (because JSON has no Buffer type) and PostgREST had stored those literal JSON characters as bytea.

Fix: explicitly encode as a Postgres bytea hex string (`\xAABBCC…`) before the upsert. PostgREST recognizes the prefix and decodes hex into the bytea column. The SELECT path was already correct (PostgREST encodes bytea as `\x…` on read), so the round-trip is now clean.

This bug class is silent. The INSERT succeeds, the row exists, the column has data — but the data isn't what you wrote. Only the eventual decrypt blows up. Watch for it whenever a column type doesn't have a native JSON representation.

**JSON-over-HTTP doesn't carry binary. Spell it out when the target column is bytea.**

---

*Phase 3c complete. Scheduler + Integrations live, scraper hardened, scoring loop fixed, all on Vercel prod. Next: Phase 4 — overdelivery (cold email, auto-email-reader, AI prompt-builder interview, multi-party FreeBusy).*

---

## 33. Staff-only context, delivered via auth-gated link

How do you put interviewer prep questions in a Google Calendar invite without the candidate seeing them?

Short answer: you can't. Anything in `events.description` ships to every attendee — Google doesn't have per-attendee visibility on event descriptions. Considered a handful of angles: `extendedProperties.private` (organizer-only but not displayed for staff to read), Apps Script triggers to rewrite per recipient (overkill, fragile), separate organizer-only events that mirror the real one (doubles the records, breaks single-source-of-truth).

Settled on a different shape: the description includes a LINK to the prep info, hosted on our own app at `/interviews/<id>/prep`. The page lives in the `(dashboard)` route group, which gates on auth. Candidates can see the URL in their invite, but the destination redirects to login. They don't have an org account, so they can't authenticate, so they can't see the content. Staff with an active session see it directly.

The link in the description is shortened via `/l/<slug>` so the description stays readable — 12 base62 chars, ~71 bits of entropy on the slug. The page underneath is the real access control; the short slug is just hygiene.

The same pattern generalizes. Phase 4's cold-email module can do the same: the email body links to a staff-only "review and send" page hosted in our app. The email is the public-facing artifact; the app is where the private context lives; an auth-gated link bridges the two.

**Public artifacts can carry private context if the link's destination has its own auth.**

---

*Phase 3 fully closed. 33 cowork-log entries. Ready for Phase 4.*

---

*Day 4 — 2026-05-20*

## 34. Splitting Phase 4 — and the cron schedule that lives in the database

Phase 4 was always going to be the messy one. Six potential overdelivery items, all loosely related, all medium-sized. The original phase doc listed them as a buffet. Sitting down to plan today, the problem was obvious: trying to drive any single Claude Code session through "pick three items and build them" was an invitation to context blow-up and half-finished modules. Better to split: one prompt per sub-feature, each ~700 tokens, each with locked contracts and a closing smoke-test list.

The cut: 4a (AI prompt-builder questionnaire), 4b (cold email draft + send), 4c (auto-email-reader). Defer multi-party FreeBusy, undo/redo conflict UX, and per-invitee response tracking to Phase 5 polish. Pre-Phase-4 ships a small finish-Phase-3 task — Google FreeBusy conflict detection on the booking form, warn-only — because Module 4's rubric explicitly asks for it and it's 30 minutes of build.

The interesting architectural call came from 4c. Vercel Hobby allows cron jobs to fire only once a day. We want auto-reader poll cadence of 15 minutes by default and 30 seconds for demo. Two paths: upgrade to Pro for demo week, or hit our endpoint from outside Vercel. We chose outside — cron-job.org, free, supports per-minute schedules with bearer-token auth.

But that raised a deeper question: cron schedule is set at deploy time (one schedule for the whole app), and we want per-user cadence (15min / 5min / 1min / 30s). The shape that works: schedule the external cron at the shortest cadence (1 min). The endpoint then iterates `gmail_watch_configs`, and for each row checks `if now < next_poll_at: skip`. After processing, set `next_poll_at = now + polling_frequency_sec`. The DB carries the per-user schedule; the cron is just a heartbeat.

The questionnaire-vs-chat call for 4a was the smaller story. I had a draft from a week ago that built a multi-turn chat with SSE + 10-turn safety cap. Looking at it fresh, the chat shape was performing complexity for the demo, not capturing more information. The user already knows what role they're hiring — they don't need to be coaxed through it. A questionnaire with five dropdowns and three textareas captures the same signal in a quarter of the code.

**Schedule per-user cadence in the database; let the cron be the dumb heartbeat. And when you find yourself building a chat to ask five questions, build a form instead.**

---

## 35. Warn, don't block — calendars aren't sources of truth about time

Module 4's rubric calls out "แจ้งเตือนเมื่อมีการนัดซ้อนกัน" — alert when bookings overlap. The naive interpretation is a hard block: don't let the user submit while the proposed window collides with an existing event. The right interpretation is softer.

The booker's calendar isn't a single source of truth for the booker's time. Focus blocks, buffer blocks, "tentative" events from other tools that sync into Google Calendar, lunch placeholders left over from the prior week — they all show up as `busy` in `freebusy.query`. A hard block would create friction every time HR tries to book during one of these, and the user would learn to either delete the buffers (defeating their purpose) or develop muscle memory to work around our form. Either way the rule has won an argument with the user instead of helping them.

So we ship a warning instead. The check fires ~400ms after both time fields settle, hits FreeBusy on `primary`, and renders a terracotta-tinted card under the time pickers naming the conflict ("Standup — May 20 · 10:00–10:30"). Submit stays enabled. If HR really does need to double-book, they read the warning and move on. If they didn't notice the clash, they catch it before sending the invite.

A second call to `events.list` over the same window resolves the busy intervals to titles — FreeBusy is title-blind by design (privacy), but if it's *your own* primary calendar the event titles are already yours. One extra HTTP round-trip at a debounced cadence is cheap insurance against a useless "10:00–10:30 is busy" message.

The auth-degrade path matters too: if the user signed in via email OTP and never connected Google Calendar, the conflict-check just returns `{ conflicts: [] }`. No "connect Google" toast from the conflict checker — that hint is already handled by the booking-submit path. Duplicating it would be noise on a feature the user didn't ask for.

**A warning informs the user. A block dictates to them. The right friction is the kind they can ignore when they have a reason to.**

---

## 36. Six bugs, one chain — when a QA pass exposes the shape

Ben deployed the conflict-detection build and immediately hit six things in one screenshot: reschedule had no warning, Google deletes didn't reflect on the web, the warning was slow, conflicting events at non-exact-start times showed without a title, CV URLs were back to the long form on reschedule, and the web showed three interviews while Google showed two. Six issues, surface-level different, and three of them ended up sharing root causes.

The slow warning + missing title were the same bug. I'd reached for FreeBusy first because that's the API named after the question I was asking ("is the user busy?"). But FreeBusy returns intervals *clipped to your query window* — proposing 17:10–17:40 against a 17:00–17:30 standup returns a busy block of 17:10–17:30, which never matches the event's actual 17:00–17:30 start/end on the secondary `events.list` call I was using for titles. Two API calls, expensively coordinated, producing worse data than one. Dropped FreeBusy entirely, kept only `events.list`, ran overlap math directly on the returned events. Faster *and* correct. The lesson: the API with the on-point name isn't always the right shape — sometimes the more general endpoint gives you everything you need in fewer calls.

The CV-URL regression was the kind of bug that only happens when the same logical operation lives in two places. The create path wrapped the signed Supabase URL with the link shortener; the reschedule path had its own inlined copy that just assigned the long URL directly. Both worked. One was wrong. The fix wasn't to patch the reschedule path — it was to extract `getCandidateCvInviteUrl()` into `lib/interviews/cv-link.ts` and have both routes call it. Now the long URL physically can't sneak back in because no caller chooses; there's exactly one function for "what CV link goes in an invite?" "Never let this happen again" is an architectural property, not a checklist item.

The Google→DB sync was the architectural omission. We'd built three routes that pushed changes to Google (create / reschedule / cancel) and zero that pulled changes back. Ben deleting an event in his Google app left our DB blind. The fix added one function `reconcileWithGoogle()` plus a server-side reconcile on `/schedule` page load — one `events.list` call, build a set of live event IDs, anything in our DB whose `google_event_id` isn't in the set gets marked cancelled through `withAudit` so it's still undo-able. The defensive bail (if Google returns >250 events and indicates more pages, skip rather than risk false cancellations) cost three lines and removed a whole class of "wait, where did my interview go" incidents.

The ghost interview at 17:30 in Ben's screenshot was just the first observable instance of the sync gap. Whether he created two and clicked submit three times, or created three and deleted one in Google, didn't matter — the right answer was to make our DB reflect Google's reality on every page load, and let the underlying cause stop mattering. The Refresh button is just there for the moment between "I deleted it" and "I'm about to navigate."

**When a QA pass surfaces three bugs that share a root cause, the right deliverable isn't three fixes — it's a piece of architecture that makes the failure mode unrepresentable.**

---

*Pre-Phase 4 complete: conflict detection (booker-only, warn-only, 150ms debounced) + Google→DB sync + CV-link centralization. 36 cowork-log entries. Ready for Phase 4a / 4b / 4c.*

---

## 37. The cold-email feature couldn't stand alone, so it stopped trying

The original Phase 4b plan was a self-contained module: a "Draft email" button on the candidate detail page, a "Send now" button next to it, a confirm dialog, a signature in `user_settings`. Clean, scoped, ~one-day build. Sitting with it today, the question that kept surfacing was *who would actually click that button*. The answer was always "a user who's already decided to reach out to a candidate they like." Which begged a different question: in our workflow, how do candidates get into the system at all?

Today's two modes — manual paste in the Scraper and PDF upload — are both inbound. The candidate came to *us*. For those candidates, the cold-email button is awkward; you don't usually need to cold-pitch someone who already applied. Cold email earns its name when *we* went and found *them*.

That reframed the work. The missing module wasn't "send email" — it was "outbound sourcing." Once you have a JD-driven "Find candidates for this JD" flow that drops sourced people into the Tracker with `source: outbound_sourced`, then cold email is no longer the headline feature; it's the *next-step CTA* from a sourced candidate's detail page. The two ship together, in that order: 3d builds the funnel, 3e gives it a mouth.

The assignment brief made the JobsDB scrape requirement explicit, which gave 3d a natural shape with two sub-features under one phase: JobsDB inbound (HR pastes a candidate's JobsDB URL into a new Scraper tab) AND outbound sourcing (LinkedIn via Proxycurl as v1 backbone, JobsDB via Google site-search as best-effort, Indeed and SEEK stubbed for v2). Both share the JobsDB plumbing, so neither pays a tax for the other.

Migration order shifted to match: 3d takes 0007 (`sourcing_runs` + new source enums + SerpAPI key), 3e takes 0008 (`emails` table + signature/from-name in user_settings), and Phase 4c's planned auto-reader migration slides down to 0009. Phase 4 narrowed to 4a (prompt-builder) + 4c (auto-email-reader); 4b is gone, replaced.

**When a feature can't justify its own button, it's usually because it's missing the flow that calls it. Build the flow first, and the feature becomes a verb on something the user already wanted to do.**

---

*Phase 4 re-planned: cold email absorbed into outbound flow. 3d → 3e → 4a → 4c. 37 cowork-log entries. Build sessions next.*

---

## 38. Splitting N across providers when half of them aren't real

Phase 3d's orchestrator had a small but interesting shape question: if HR picks LinkedIn + JobsDB and asks for 10 candidates, how do you allocate the work? The mechanical answer is "5 each, round-robin the remainder." That's what the code does. The interesting question is what to do when the user *also* checks Indeed and SEEK — both of which are stubs returning `{ candidates: [], note: 'not_implemented' }`.

Two patterns suggested themselves. (a) Divide N evenly across every selected platform: a 10-candidate run with all four boxes ticked allocates 3 + 3 + 2 + 2 and quietly returns 6 results because two of those allocations evaporate into the void. (b) Allocate only to live providers; treat the stubs as visual selections that emit a `provider_done` event with the `not_implemented` note for honesty, but don't take any of N's budget.

Picked (b). The reasoning: the user's intent when ticking JobsDB and SEEK together isn't "give me a third of my candidates from each" — it's "look in both places." If one place doesn't actually exist yet, the budget should flow to the place that does. The stub `provider_done` events still surface in the SSE log so the user sees "SEEK done: 0 found (not_implemented)" and isn't left wondering what happened to that checkbox. The UI also disables Indeed + SEEK by default, so this only matters when someone unchecks the disabled-state and ticks them anyway — but defending against that case keeps the contract clean.

There was a quieter call in the same file: the orchestrator scores each candidate inline via a new `scoreCandidateSingle()` helper rather than by fetching `/api/score/run` over HTTP. The HTTP path was simpler to wire on paper — call our own endpoint, get SSE back, done — but it needed the user's session cookie, which a server-side async generator doesn't have, and it wrapped scoring in a stream protocol whose progressiveness we didn't need here. Extracting the helper duplicates ~30 lines of persistence code from the existing route, but it lets the orchestrator stay synchronous-ish (await one score, yield one event, await the next) and means a failed score for candidate #3 emits a localized error without taking down candidates #4-#10. Cleaner failure isolation in exchange for one duplicated copy of `INSERT INTO scores`.

**When stubs share the UI surface with live providers, treat the user's selection as intent to look in those places — not as an obligation to allocate budget to them. And when an in-process helper is the right shape, paying a small duplication cost beats wedging an HTTP call into a place that wasn't built for one.**

---

*Day 5 — 2026-05-21*

## 39. The spec was built on a wrong assumption — and the iteration loop that followed

The Phase 3d prompt looked clean on paper. JD-level "Find candidates" dialog, Apify for LinkedIn, SerpAPI+Jina for JobsDB, scoring on the way in. I built it, pushed it, and Ben's first real run produced two "<UNKNOWN>" candidates from a JobsDB Jina-only fallback that had scraped a job-listing search page and tried to make people out of it. Money spent: $0.09. Real candidates extracted: zero.

The wrong assumption was *that JobsDB had public candidate URLs at all*. It doesn't. Ever. JobsDB is an employer-side product — candidate detail pages are login-walled by definition. So the whole "fan out search across LinkedIn + JobsDB" framing was just LinkedIn with a useless second checkbox. The fix wasn't to make JobsDB outbound less flaky; it was to delete the premise. Disabled the checkbox, added a money guard that drops any "candidate" with a placeholder name before scoring spend, and reframed the JobsDB workflow entirely around a **bookmarklet** that piggybacks on the user's logged-in browser session — the only context in which JobsDB candidate data actually exists.

The bookmarklet bug arc was its own lesson. First version used `fetch()` from the source page — blocked by LinkedIn's CSP `connect-src`. Switched to a `window.open()` to our own `/bookmarklet-capture` page carrying the payload in the URL hash; that bypasses CSP because the POST originates from our same-origin tab. Then React 16.9+ refused to render `javascript:` URLs in JSX `href` props (silently replaces them with an error stub) — fixed by setting the href via DOM after mount with a `useRef`. Then LinkedIn's lazy-loaded experience sections returned empty captures unless the page was scrolled first — added a top-to-bottom scroll dance in the bookmarklet. Then Haiku occasionally returned `experience` and `education` as strings instead of arrays — extended the coercer to degrade malformed array fields to `[]` rather than failing the whole extraction.

The Proxycurl-to-Apify swap had its own rabbit hole. Proxycurl gates on a paid work email at signup. Apify has a free $5/month credit and a marketplace of LinkedIn actors. But picking an actor was guesswork until Ben hit a 403 ("full-permission-actor-not-approved") on the first real call, which led to fetching the actor's docs and discovering the input shape I'd built against was completely wrong — `{ queries, keywords, maxItems, maxResults }` vs. the actor's actual `{ searchQuery, currentJobTitles, locations, profileScraperMode, maxItems }`. Even after the approval click, the first fixed-shape run returned zero results because we were ANDing 4 strict job-title filters together. Loosened to "top 4 keywords + top 2 title hints inline in searchQuery." That finally landed real candidates.

The Sourced-stage call came at the end, after Ben pointed out that mixing outbound candidates with inbound "Applied" applicants broke the funnel's narrative. Outbound = we found them, they haven't engaged. Inbound = they engaged with us. Different next actions, different visual urgency. Added the stage in front of `applied`, gave it a navy-tinted badge that reads as "passive / untouched", and now the Kanban tells a coherent story left-to-right: passive → engaged → screened → interviewed → hired.

**The most expensive bugs aren't logic errors in the code — they're foundational assumptions in the spec that don't match production reality. The pivot to bookmarklet wasn't a defensive retreat from JobsDB; it was the first version of the feature that could actually exist.**

---

*Phase 3d complete. Day 5 of 5 begins. Next: Phase 3e (cold email — Module 4 of the rubric). 39 cowork-log entries.*

---

## 40. One column for two funnels, and what it means for a cold-email button

The clean version of cold email would have its own stage: `sourced → contacted → screened`. We reached for it instinctively when Ben asked whether the candidate should auto-move after send. *Applied* didn't fit — an outbound candidate who got cold-emailed hasn't applied. A new enum value would have been the rigorous answer.

But "rigorous" was wrong here. A new stage means a new Kanban column on /tracker, a new label in three other files, an extra `ALTER TYPE` migration risk, and — most importantly — a funnel that visually separates two paths that *converge in practice*. The day after a cold-email reply lands and an inbound resume hits the same JD, both candidates are at the same point in HR's workflow: respond, screen, decide whether to interview. Splitting that column buys precision at the cost of clutter.

The call: keep the single `applied` enum, rename the label to "Applied / Contacted", and let the existing source badge on each candidate card disambiguate inbound vs outbound. The send action moves outbound candidates into the same column inbound applicants occupy. The label tells HR "engaged, either way" without forcing them to track two parallel workflows that merge anyway.

Two smaller calls fell out of the same session. The Opus 4.7 cold-email prompt is anti-spam-shaped — forbidding the clichés explicitly (*"I came across your profile…"*, vague flattery, fake urgency) rather than hoping the model knows not to. The signature stays plaintext in `user_settings` because it isn't a secret; the existing AES-256-GCM helper is reserved for credentials. And Gmail MIME got hand-rolled rather than pulled in via `googleapis` — one POST to one endpoint didn't justify the dep weight, and the existing project pattern (raw `fetch` against Google APIs) was already established by `calendar.ts`.

The dialog's typewriter pulls partial subject + body out of the streaming tool-input JSON with a tiny field-extraction regex, not by trying to `JSON.parse` a half-formed object. Mid-stream JSON is never valid; trying to parse it just produces a thrown error every 50ms. Pattern-matching `"subject": "…` and `"body_markdown": "…` and incrementally unescaping the captured tail produces a readable typewriter for a few extra lines of code.

**The right level of granularity in a funnel is the granularity that matches what the user does *next*, not what they did *before*. Inbound and outbound differ in their past; they're identical in their future.**

---

*Phase 3e complete. Module 4 of the rubric is in. 40 cowork-log entries. Next: 4a (JD prompt-builder) and 4c (auto-email-reader) as overdelivery, then final polish.*

---

## 41. Iterating cold email: defaults, drafts as first-class history, and a tiny update-vs-insert call

First QA pass on cold email surfaced three things in one breath: pickers for model + language, draft history per candidate, and the actual Hotel Plus signature to seed. Easy individually; the interesting one was draft history, because once you commit to "save every AI draft so the user can pick from past attempts," you have to answer what *send* means against that store.

The naive shape: send always inserts. Result — generating five drafts before liking one creates one *sent* row plus five orphan *drafted* rows per candidate, forever. After two candidates and three retries each, the table is mostly draft cruft. The cleaner shape: when a draft was autosaved at stream completion, the send action UPDATEs that row from `drafted` to `sent` rather than inserting a duplicate. The dialog gets an `emailId` back in the `draft_complete` SSE event, holds it as state, and passes it along when the user clicks Send. If the user regenerated, the new draft replaces `emailId` in state and the previous drafted row stays around as historical artifact (still a `drafted` row, eligible to be loaded from history later). If the user loaded a past *sent* row to base a new outreach on, we drop the emailId so the new send becomes a fresh insert — preserving the original send record.

That single bit of state — "is this current editor content backed by a drafted row I can promote, or is it a fresh composition?" — turned out to be the entire architectural decision. The audit log mirrors it: insert when fresh, update when promoting a draft. `withAudit` doesn't care which; it just records the `before/after` faithfully. The activity feed now distinguishes "drafted email" rows that never went out (those are filtered from the dialog history but still in the DB) from "sent email" rows, with the same emailId tying them together.

The pickers were straightforward — model defaults to Opus 4.7 (voice matters), language defaults to Thai (Hotel Plus is a Thai firm; most outreach is in Thai). The `auto` language option reads the candidate's scraper-detected `detected_language` and picks Thai for `th`, English for everything else. The persona prompt branches on a "Thai" or "English" string and embeds an explicit LANGUAGE directive at the top — for Thai, it specifies ครับ/ค่ะ politeness without sliding into palace-formal register, and keeps rationale-for-recruiter in English.

The signature preset is a one-click button, not an auto-populate. Auto-populate would feel pushy and risks overwriting in-progress edits. A button is discoverable, idempotent, and lets the user keep their job title field intact while seeding the company block.

The other tiny decision: the dialog auto-fires the AI stream only when the candidate has *no* history. With history present, the dialog opens to an "awaiting" state — history visible, "Draft a new email" button explicit. This costs one click for first-timers (none, since they have no history) and saves Opus tokens for everyone else, because the most common second-visit intent isn't "generate again" — it's "look at what I drafted last time."

**Autosave changes what *send* means. Once every draft is persisted, send needs to know whether to promote-or-insert — and the cheapest way to know is to carry the candidate's row id through the UI and let the action branch on its presence.**

---
