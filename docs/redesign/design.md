# Hotel Plus design system — source of truth

This is the locked spec for the rebrand of the Acquisition Pipeline. Tokens were extracted from the live Wix CSS on [hotelplus.asia](https://www.hotelplus.asia/) (the `--color_*` and `--font_*` variables in [`hotelplus-html.txt`](./hotelplus-html.txt)) and from the marketing screenshots in [`sc1.png`](./sc1.png) – [`sc5.png`](./sc5.png).

Implementing chats should treat the values below as **non-negotiable**. If a value seems wrong, re-derive it from this folder before changing it.

---

## 1. Colors

Stored as HSL strings so they slot directly into Tailwind v4's `@theme inline` block in [app/globals.css](../../app/globals.css).

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--yellow` | `#FFD52B` | `48 100% 58%` | Primary accent. Nav bg, CTAs, H+ logo, hover highlights |
| `--yellow-tint` | `#FFEA95` | `48 100% 79%` | Subtle accent bg (callouts, hover states) |
| `--yellow-pale` | `#FFF1B8` | `48 100% 86%` | Softest accent bg (info chips, badge fills) |
| `--black` | `#000000` | `0 0% 0%` | Primary text, footer bg, nav text on yellow |
| `--white` | `#FFFFFF` | `0 0% 100%` | Primary content bg, button text on black |
| `--off-white` | `#F8F8F8` | `0 0% 97%` | Secondary bg (cards, table stripes) |
| `--soft-gray` | `#EEEEEE` | `0 0% 93%` | Hairlines, disabled bg |
| `--gray` | `#707070` | `0 0% 44%` | Secondary text, captions |
| `--gray-dim` | `#B0B0B0` | `0 0% 69%` | Placeholder text |
| `--destructive` | `#C42A2A` | `2 65% 48%` | Error states (unchanged from current) |

### Semantic mapping (shadcn tokens)

| shadcn semantic | Maps to |
|---|---|
| `background` | `--white` |
| `foreground` | `--black` |
| `card` | `--white` |
| `card-foreground` | `--black` |
| `primary` | `--yellow` |
| `primary-foreground` | `--black` (yellow buttons get black text — verified against [sc2](./sc2.png) CTA buttons) |
| `secondary` | `--off-white` |
| `secondary-foreground` | `--black` |
| `muted` | `--off-white` |
| `muted-foreground` | `--gray` |
| `accent` | `--yellow-pale` |
| `accent-foreground` | `--black` |
| `border` | `--soft-gray` |
| `input` | `--soft-gray` |
| `ring` | `--yellow` |
| `popover` | `--white` |
| `popover-foreground` | `--black` |
| `destructive` | `--destructive` |
| `destructive-foreground` | `--white` |

### Stage badge palette

The Postgres `candidate_stage` enum has 8 values (see [lib/db/enums.ts](../../lib/db/enums.ts)). Funnel-stage colors are chosen *within* the Hotel Plus palette as a saturation ramp across the active stages, with a clean visual narrative: cool entry → warming yellows → inverted black-on-yellow for offer → bold yellow for hired → desaturated for rejected.

| Stage | Background | Text | Border | Visual logic |
|---|---|---|---|---|
| `sourced` | `--off-white` | `--gray` | `--soft-gray` | Quiet entry — not engaged yet |
| `applied` (a.k.a. "Applied / Contacted") | `--yellow-pale` | `--black` | `--soft-gray` | Warm, in-flight |
| `screening` | `--yellow-tint` | `--black` | `--soft-gray` | Heating up |
| `prescreen_call` | `--yellow-tint` | `--black` | `--yellow` | Active — prescreen scheduled (yellow border = action) |
| `first_interview` | `--yellow` | `--black` | `--yellow` | Active — first interview (full yellow chip) |
| `offer` | `--black` | `--yellow` | `--black` | Inverted — terminal pending |
| `hired` | `--yellow` | `--black` (semibold) | `--black` | Terminal positive — yellow chip with bold black ring |
| `rejected` | `--soft-gray` | `--gray` | `--soft-gray` | Deactivated |

### Source badge palette

| Source | Treatment |
|---|---|
| inbound (applied, email, referral, manual) | `bg-off-white text-black border-soft-gray` |
| outbound (LinkedIn / Apify / scraped) | `bg-off-white text-black border-soft-gray` + thin `border-b-2 border-yellow` (yellow underline accent to disambiguate) |

---

## 2. Typography

Decision: **spirit mimic** (per planning Q&A). Keep Hotel Plus's display font, swap their body font for one that reads better in data-dense UI.

```css
--font-display: var(--font-montserrat); /* weight 700 default, 900 for hero */
--font-sans:    var(--font-inter);
--font-mono:    var(--font-jetbrains);
```

| Role | Family | Weights | Source |
|---|---|---|---|
| Display / headings | **Montserrat** | 700 default, 900 for hero | `next/font/google` — `Montserrat({ weight: ['700', '900'] })` |
| Body / UI | **Inter** | 400 default, 500 emphasis, 600 strong | `next/font/google` — `Inter()` (variable weight) |
| Mono | **JetBrains Mono** | 400, 500 | `next/font/google` — `JetBrains_Mono()` |

**Styling rules:**
- All `h1`-`h6` use Montserrat **Bold 700**, black `#000`, tight letter-spacing `-0.01em`
- Hero / page titles may use Montserrat **Black 900**, optionally UPPERCASE (mimics the "HOTEL PLUS" wordmark style in [sc1](./sc1.png) / [sc2](./sc2.png))
- Body uses Inter 400 by default; Inter 500 for labels and emphasis; Inter 600 for buttons and strong inline emphasis
- Tabular numerics in tables/dashboards: use `font-variant-numeric: tabular-nums`

**Sizes:** keep current Tailwind defaults (`text-xs` through `text-4xl`). Hotel Plus uses 70px/50px/32px in marketing — overkill for an internal tool. Internal UI keeps `text-2xl` / `text-xl` / `text-lg` for page titles / section titles / card titles respectively, with Montserrat 700 making them visually weighty without raw size.

---

## 3. Radii

Hotel Plus uses sharp corners. The H+ logo is a pure square (0 radius), cards have minimal radius (~2-4px), pills are the only fully-rounded element (Chat pill, button pills).

```css
--radius-sm: 0.125rem;  /* 2px — chips, badges */
--radius:    0.25rem;   /* 4px — buttons, inputs, cards (default) */
--radius-lg: 0.375rem;  /* 6px — large surfaces, modals */
```

The H+ logo block is **always `rounded-none`** — it's the defining brand mark.

---

## 4. Shadow / elevation

Hotel Plus uses very subtle elevation. Keep the existing shadow ladder but tint with **black** instead of navy.

```css
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.04);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05);
```

Heavy drop shadows feel un-Hotel-Plus. They go for flat-with-hairline-borders.

---

## 5. Chrome — top nav (marketing-faithful)

Per planning Q&A, the dashboard top nav goes **solid yellow** to mirror the marketing site header.

**Layout** (matches [sc1](./sc1.png) header bar):
- Height: ~64-72px (current is fine; Hotel Plus marketing uses 130px which is too tall for an app)
- Background: `bg-yellow`
- Border-bottom: `border-b border-black` (1px black hairline divider, optional — they don't have one but it grounds the bar)
- H+ logo block: **inside** a small white panel cutout on the left edge (matches the marketing pattern where the logo appears to "sit on" the yellow bar with its own white slab), OR simpler — black square with yellow `H+` text. Either reads as on-brand. Recommend the simpler black-square treatment for the internal tool (less Wix-y, more app-like).
- Nav links: black text, Inter 600, hover inverts to `bg-black text-yellow`
- Active link: solid black pill or 2px black bottom border
- User email + sign out: black text, ghost button styling
- Mobile: links collapse into a black-icon hamburger that opens a dropdown

**Footer (auth layout only):**
- `bg-black text-white` (matches [sc5](./sc5.png))
- Links use `text-yellow` with `hover:underline`
- Tagline + copyright in `text-gray-dim`

---

## 6. Decorative motifs

Use **sparingly** — these are condiments, not the main course.

**Yellow chevron / right-arrow accent** ([sc3](./sc3.png) service cards):
- A `>` or `▸` shape in yellow on the corner of a hero/feature card
- Use on: JD list cards, settings tiles, empty-state CTAs
- Don't use on: data rows, table cells, dense lists

**H+ logo block:**
- 40×40 (nav) / 80×80 (auth hero) / 120×120 (empty states)
- Always rounded-none
- Two valid color treatments:
  - `bg-yellow text-black` — for on-white contexts
  - `bg-black text-yellow` — for on-yellow contexts (nav bar)
- Font is Montserrat Black 900, never lighter

**Solid yellow CTA pill:**
- `bg-yellow text-black hover:bg-[#FFCC00]` (slightly darker on hover)
- Active state: 2px black ring
- Disabled: `bg-soft-gray text-gray cursor-not-allowed` (NO yellow on disabled — yellow always means "live")

**Black inverted button** (secondary):
- `bg-black text-white hover:bg-black/85`
- For dangerous-but-not-destructive actions (Cancel, Discard, Logout)

---

## 7. Reference assets in this folder

| File | What it is |
|---|---|
| [`hotelplus-html.txt`](./hotelplus-html.txt) | Full Wix HTML dump of the Hotel Plus homepage. Search for `--color_` / `--font_` to re-verify any token. |
| [`sc1.png`](./sc1.png) | Hero — yellow nav, hotel atrium photo, big "HOTEL PLUS" wordmark CTA |
| [`sc2.png`](./sc2.png) | About — yellow nav, photo + body copy, yellow CTAs |
| [`sc3.png`](./sc3.png) | Services — title bar with yellow accent strip + service cards with yellow chevron cutouts |
| [`sc4.png`](./sc4.png) | Counter section — yellow bg block, partner logos |
| [`sc5.png`](./sc5.png) | Footer — black bg, H+ logo on yellow, yellow link chevrons, subscribe form |

For the `/design-system` route to render these, compressed copies live under [`public/design-ref/sc1.png`](../../public/design-ref/sc1.png) … `sc5.png`.

---

## 8. Source of truth lineage

If any value here disagrees with an implementing chat's instinct, the order of authority is:

1. **The Wix CSS** in `hotelplus-html.txt` — the literal values their live site renders today
2. **This file** (`design.md`) — derived spec, locked at planning time
3. **The planning file** at `C:\Users\chano\.claude\plans\i-need-help-redesign-indexed-popcorn.md`
4. Anything else (memory, chat context, instinct) — re-derive from (1) and (2)

Update this file only when re-derived from the Wix CSS, not when an implementing chat decides "it would look better if…".
