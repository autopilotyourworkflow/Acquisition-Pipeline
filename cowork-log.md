# Cowork Log — Acquisition Pipeline

> A running log of the major decisions and iterations during this build,
> per the assignment's bonus requirement. Format per entry:
> Objective · Discussion/Pros & Cons · Prompt/Iteration · Outcome.

---

## Entry 1 — Architecture & tech stack selection
**Date:** 2026-05-18

**Objective:** Choose a stack for a 5-day take-home that satisfies four modules
(Scraper, Screener, Tracker, Scheduler) plus significant overdelivery (premium
UI, auto-pipeline scrape→score→email, scraping-fallback toolkit, multi-party
calendar, audit log + undo/redo).

**Discussion / Pros & Cons:**
- *Next.js + Supabase* vs *Next.js + Prisma + Postgres + NextAuth* vs *T3*. We
  picked **Next.js 16 (App Router) + Supabase**. Single vendor for auth +
  Postgres + Storage + RLS + Realtime, RLS pushes "same-org" enforcement to
  the DB rather than scattering it through the app, and Server Components
  ship pre-fetched data without a waterfall. Prisma/NextAuth would have meant
  bolting four pieces together by hand for no payoff at this scale.
- *Shadcn/ui + Tailwind v4* over MUI / Chakra. Shadcn isn't a library — it
  generates Radix-based components we own and can theme freely. Critical for
  matching Hotel Plus's brand palette without fighting a design system.
- *Vercel vs Cloudflare Pages for hosting.* Cloudflare Pages would let us
  consolidate to one vendor, but several runtime deps (`pdf-parse`, Gmail
  SDK, googleapis) want Node, not the edge. Vercel is Next.js-native; the
  Cloudflare domain stays where it is and we bridge with a single CNAME.

**Prompt / Iteration:** Multiple rounds of clarifying questions to lock the
stack, hosting, auth model, and overdelivery scope — see the approved plan
file at `C:\Users\chano\.claude\plans\let-s-start-planning-addition-prancy-glade.md`.

**Outcome:** Locked Next.js 16 + Supabase + shadcn + TanStack Query + Claude
(Opus + Haiku) + Vercel + Cloudflare DNS. All four modules + five overdelivery
items scoped to a day-by-day plan with a Day-4 MVP cut line.

---

## Entry 2 — URL + hosting topology
**Date:** 2026-05-18

**Objective:** Decide where the app lives on the web given the user already
owns `autopilotyourworkflow.com` on Cloudflare.

**Discussion / Pros & Cons:**
- *Subpath* (`autopilotyourworkflow.com/resume-screener`) vs *subdomain*
  (`acq.autopilotyourworkflow.com`) vs *Vercel default* (`*.vercel.app`).
  Subpath would require Next.js `basePath` + Cloudflare proxy rewrites +
  OAuth redirect-URI gymnastics. Subdomain is one CNAME, cleaner OAuth,
  forward-compatible with adding more "autopilot" apps later.
- *Stay on Cloudflare for hosting* vs *bridge to Vercel.* Cloudflare-only
  would mean re-engineering Node-only paths for the edge runtime. Bridging
  to Vercel costs one DNS record and zero dollars.

**Prompt / Iteration:** User asked for a thorough explanation of the
registrar / DNS / hosting separation. I produced the three-layer model with
a postal-mail analogy, plus a side-by-side trade-off table.

**Outcome:** `acq.autopilotyourworkflow.com` on Vercel, single DNS-only
CNAME in Cloudflare. CNAME will be added at deploy time (end of Day 1).

---

## Entry 3 — Brand accent: terracotta over gold
**Date:** 2026-05-18

**Objective:** Pick the accent color for Hotel Plus's brand-matched UI.

**Discussion / Pros & Cons:**
- *Warm gold #C9A961* — the obvious "hotel" choice. Risk: reads as casino
  loyalty card or Trump-Tower at large fills. Tight rope to walk in B2B.
- *Terracotta #BD5B3C* — channels Thai temple roofs, Aman/Capella, restored
  shophouse brick. Distinctive in a SaaS market saturated with blue/purple.
- *No accent (navy + cream only)* — ultimate minimalism, very Aman. Trades
  distinctiveness for restraint.

**Prompt / Iteration:** UX design agent argued strongly for terracotta with
reasoning about regional cues and SaaS differentiation. User agreed —
"the bold choice."

**Outcome:** Terracotta #BD5B3C is locked as the primary accent. All CTAs,
focus rings, active states, and the H+ monogram echo use it. One accent
only — never gradients, never combined with gold.

---

## Entry 4 — Auth: decoupled identity from API permissions
**Date:** 2026-05-18

**Objective:** Decide how users sign in, given that some HR users will be
uncomfortable connecting their personal/work Google account but the app
needs Calendar + Gmail OAuth for two of the overdelivery features.

**Discussion / Pros & Cons:**
- *Google OAuth only* — fastest path, one click, gets Calendar + Gmail
  scopes "for free." But forces every user into Google data-sharing
  before they can even browse the app.
- *Email OTP only* — privacy-friendly, but the Calendar + Gmail features
  become unreachable for everyone.
- *Both, decoupled* — sign-in supports either Google or Email OTP. Calendar
  and Gmail are then per-scope toggles in Settings → Integrations,
  requested only when the user opts in. Features degrade gracefully when
  scopes are missing.

**Prompt / Iteration:** User raised the concern unprompted: "add email+otp
in case the user not comfortable using their google account." Confirmed
that the right pattern is to separate **identity** (who you are) from
**delegated permissions** (what Google APIs we may call on your behalf).

**Outcome:** Two-path login (Google OAuth + Email OTP) + four granular
Google scope toggles in Settings. UI degrades to "Copy to clipboard /
mailto:" if Gmail isn't connected, and to "external invitee" if Calendar
isn't connected.

---

## Entry 5 — Audit log + per-user undo/redo
**Date:** 2026-05-18

**Objective:** Make multi-user team activity legible and reversible.

**Discussion / Pros & Cons:**
- *Audit log only* — cheaper to build, but no recovery from accidental
  changes without manual SQL.
- *Full audit + global undo/redo* — anyone can undo anyone's recent action.
  Risk: messy multi-user conflicts.
- *Full audit + per-user undo/redo with conflict detection* — log every
  mutation team-wide, but undo/redo limited to a user's own last 20
  actions in last 30 min, with a hash-based conflict prompt when
  downstream changes exist.

**Prompt / Iteration:** Requirement raised unprompted by the user during
the access-control discussion. Recommended the third option as the right
balance of safety and shared awareness.

**Outcome:** Every mutation wraps `withAudit()` which writes `activity_log`
with `before` + `after` + `after_hash`. Undo replays inverse mutation;
hash mismatch triggers a "row changed since your action — undo anyway?"
modal.

---

## Entry 6 — Initial scaffold
**Date:** 2026-05-18

**Objective:** Get a buildable Next.js project on GitHub with brand
tokens applied and dev environment ready.

**Discussion / Pros & Cons:**
- *pnpm vs npm* — pnpm preferred but corepack failed with EPERM in
  `C:\Program Files\nodejs`. Falling back to npm is fine for this
  project; no functional downside.
- *Tailwind v3 (config-file) vs v4 (CSS @theme).* `create-next-app`
  defaulted to v4 + Turbopack. Took the new direction — `@theme` and
  CSS variables are cleaner than `tailwind.config.ts`.
- *Where to put PROJECT_MASTER.md.* Kept at repo root for visibility.

**Prompt / Iteration:** First scaffold attempt failed because npm rejects
"Resume Screener" as a package name (space + capitals). Worked around by
scaffolding into a `acquisition-pipeline/` subdir, then copying contents
up with `cp -r acquisition-pipeline/. .`.

**Outcome:** Next.js 16.2 + React 19 + Tailwind 4 + TypeScript live with
brand tokens in `app/globals.css`, Fraunces + Inter + JetBrains Mono
loaded, runtime deps installed (Supabase SSR, Anthropic SDK, TanStack
Query, zod, sonner, lucide, shadcn primitives). First commit pushed to
`github.com/autopilotyourworkflow/Acquisition-Pipeline`. `next build`
passes clean.

---

## Entry 7 — Database schema + Supabase clients + auth flow
**Date:** 2026-05-18

**Objective:** Land the database schema for all four modules + overdelivery
features, plus the wiring (Supabase server/browser/admin clients, proxy
middleware) and the two-path login (Google OAuth + Email OTP).

**Discussion / Pros & Cons:**
- *Single-org vs multi-tenant schema.* Single-org with a hardcoded
  `org_id` constant is simpler and exactly what we need for a take-home;
  if multi-tenant is needed later, swap the constant for a real
  `orgs` FK without rewriting RLS.
- *OAuth-token encryption — pgcrypto in DB vs AES-GCM in Node.* Pgcrypto
  requires storing a Postgres-level secret (via GUC) which then lives in
  the DB itself. AES-GCM in Node keeps the encryption key in
  `process.env` and stores only opaque blobs in DB. Cleaner separation;
  chose the Node approach. `oauth_tokens.refresh_token_encrypted` is
  `bytea`.
- *Composite-key gotcha on `interview_invitees`.* We want one PK across
  internal users AND external emails. Postgres doesn't support
  `PRIMARY KEY (a, COALESCE(b, c))` directly, so used a stored
  `GENERATED ALWAYS AS (COALESCE(user_id::text, external_email)) STORED`
  column.
- *First-signup = owner.* Implemented via a `handle_new_user()` trigger
  on `auth.users` insert. Counts existing public.users rows; if zero, the
  new row gets `role = owner`, else `member`.
- *Email OTP flow design.* Chose code-input (6 digits) over magic-link
  because email clients sometimes mangle links and code-input gives a
  clearer error mode. Two-step form: enter email → server emails code →
  enter code → session created.
- *Next.js 16 deprecated `middleware.ts` to `proxy.ts`.* Same runtime
  contract, just renamed. Adopted immediately to avoid a deprecated
  warning in build output.

**Prompt / Iteration:** Migration designed against the approved plan's
data-model section; clients follow Supabase's `@supabase/ssr` recipes.
`next build` hit the middleware-deprecation warning; renamed to `proxy.ts`,
warning cleared.

**Outcome:** `supabase/migrations/0001_init.sql` ready to apply (full
schema, 12 tables, 7 enums, RLS on all of them, 2 storage buckets, JD
seed). `lib/supabase/{server,browser,admin,middleware}.ts` wired.
`proxy.ts` gates protected routes. Two-path login (`/login` with Google +
email OTP) + `/auth/callback` exchanger built. `/tracker` is a real
Server Component that queries Supabase via RLS-scoped anon key. Build
clean.

---
