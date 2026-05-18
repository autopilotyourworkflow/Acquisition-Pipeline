# Cowork Log

> A record of the decisions I made building the Acquisition Pipeline, and the
> thinking behind each one. AI did the typing on a lot of these; I did the
> deciding. Where the call wasn't obvious, I tried to capture what made me
> pick what I picked.
>
> Read in order — it follows the build narrative.

---

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

*Decisions still ahead: the AI scoring prompt (Day 2 — the 15% grade), the Kanban drag-and-drop ergonomics, the cold-email tone, multi-party FreeBusy slot math, browser-extension auth. I'll keep adding entries.*
