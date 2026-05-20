import Image from "next/image";
import Link from "next/link";

const PALETTE = [
  { name: "--yellow", hex: "#FFD52B", hsl: "48 100% 58%", use: "Primary accent. Nav bg, CTAs, H+ logo, hover highlights" },
  { name: "--yellow-tint", hex: "#FFEA95", hsl: "48 100% 79%", use: "Subtle accent bg (callouts, hover states)" },
  { name: "--yellow-pale", hex: "#FFF1B8", hsl: "48 100% 86%", use: "Softest accent bg (info chips, badge fills)" },
  { name: "--black", hex: "#000000", hsl: "0 0% 0%", use: "Primary text, footer bg, nav text on yellow" },
  { name: "--white", hex: "#FFFFFF", hsl: "0 0% 100%", use: "Primary content bg, button text on black" },
  { name: "--off-white", hex: "#F8F8F8", hsl: "0 0% 97%", use: "Secondary bg (cards, table stripes)" },
  { name: "--soft-gray", hex: "#EEEEEE", hsl: "0 0% 93%", use: "Hairlines, disabled bg" },
  { name: "--gray", hex: "#707070", hsl: "0 0% 44%", use: "Secondary text, captions" },
  { name: "--gray-dim", hex: "#B0B0B0", hsl: "0 0% 69%", use: "Placeholder text" },
  { name: "--destructive", hex: "#C42A2A", hsl: "2 65% 48%", use: "Error states (unchanged)" },
] as const;

type StageDef = {
  stage: string;
  bg: string;
  text: string;
  border: string;
  label: string;
  ring?: string;
};

const STAGES: StageDef[] = [
  { stage: "sourced", bg: "#F8F8F8", text: "#707070", border: "#EEEEEE", label: "Sourced" },
  { stage: "applied", bg: "#FFF1B8", text: "#000000", border: "#FFD52B", label: "Applied / Contacted" },
  { stage: "screening", bg: "#FFEA95", text: "#000000", border: "#FFD52B", label: "Screening" },
  { stage: "interview", bg: "#FFD52B", text: "#000000", border: "#000000", label: "Interview" },
  { stage: "offer", bg: "#000000", text: "#FFD52B", border: "#000000", label: "Offer" },
  { stage: "hired", bg: "#FFFFFF", text: "#000000", border: "#000000", label: "Hired", ring: "#FFD52B" },
  { stage: "rejected", bg: "#EEEEEE", text: "#707070", border: "#EEEEEE", label: "Rejected" },
];

const TYPE_SPECIMENS = [
  { role: "Display / Hero", family: "Montserrat Black 900", sizeClass: "text-5xl font-black uppercase tracking-tight", sample: "HOTEL PLUS" },
  { role: "Page title (h1)", family: "Montserrat Bold 700", sizeClass: "text-3xl font-bold tracking-tight", sample: "Candidate Pipeline" },
  { role: "Section title (h2)", family: "Montserrat Bold 700", sizeClass: "text-2xl font-bold tracking-tight", sample: "Active interviews this week" },
  { role: "Card title (h3)", family: "Montserrat Bold 700", sizeClass: "text-lg font-bold", sample: "Senior Front Office Manager" },
  { role: "Body", family: "Inter Regular 400", sizeClass: "text-base font-normal", sample: "Hotel Plus is a Thai hotel-management consulting firm specialising in revenue and operations." },
  { role: "Body emphasis", family: "Inter Medium 500", sizeClass: "text-base font-medium", sample: "Reviewer experience is the entire goal." },
  { role: "Body strong", family: "Inter SemiBold 600", sizeClass: "text-base font-semibold", sample: "Marketing-faithful — solid yellow header." },
  { role: "Caption", family: "Inter Regular 400", sizeClass: "text-sm text-[color:var(--ds-gray)]", sample: "Sourced via LinkedIn · 2 days ago" },
  { role: "Mono", family: "JetBrains Mono Regular 400", sizeClass: "text-sm font-mono", sample: "cand_01H8XGTQ9F · sha256:7f9c…" },
] as const;

const SCREENSHOTS = [
  { src: "/design-ref/sc1.png", title: "sc1 — Hero", note: "Yellow nav bar, atrium photo, big 'HOTEL PLUS' wordmark CTA. The nav and the floating yellow Chat pill are the brand signatures." },
  { src: "/design-ref/sc2.png", title: "sc2 — About", note: "Yellow nav persists. Yellow CTA buttons with black text — our primary button target." },
  { src: "/design-ref/sc3.png", title: "sc3 — Services", note: "Title bar with yellow accent strip. Service cards with yellow chevron cutouts — decorative motif to selectively borrow." },
  { src: "/design-ref/sc4.png", title: "sc4 — Counter", note: "Solid yellow band as a section break. Partner logos on white below." },
  { src: "/design-ref/sc5.png", title: "sc5 — Footer", note: "Black bg, H+ on yellow, yellow chevron link list, subscribe form. Auth footer target." },
] as const;

export const metadata = {
  title: "Design system · Acquisition",
  description: "Hotel Plus rebrand reference page",
};

export default function DesignSystemPage() {
  return (
    <div className="space-y-16" style={{ "--ds-gray": "#707070" } as React.CSSProperties}>
      {/* Header banner */}
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-[color:var(--ds-gray)]">Redesign reference · Phase 0</p>
        <h1 className="text-3xl font-bold tracking-tight">Design system — Hotel Plus rebrand</h1>
        <p className="max-w-prose text-base text-[color:var(--ds-gray)]">
          This page renders the new brand spec with inline colors so it looks correct even before
          {" "}<code className="rounded bg-[#F8F8F8] px-1.5 py-0.5 font-mono text-sm">app/globals.css</code>{" "}
          has been swapped. Use it as a pixel-check baseline against the Hotel Plus reference screenshots
          at the bottom of the page. Spec lives at{" "}
          <Link href="https://github.com" className="underline">docs/redesign/design.md</Link>.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge>Phase 0 · spec + verification</Badge>
          <Badge pending>Phase 1 · token + font swap</Badge>
          <Badge pending>Phase 2 · component cleanup</Badge>
          <Badge pending>Phase 3 · chrome retheme</Badge>
          <Badge pending>Phase 4 · page polish</Badge>
          <Badge pending>Phase 5 · brand finish</Badge>
        </div>
      </header>

      {/* Color tokens */}
      <Section title="Color tokens" subtitle="Hex + HSL extracted from the live Wix CSS. HSL strings drop into Tailwind v4's @theme inline block.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PALETTE.map((c) => (
            <div
              key={c.name}
              className="flex overflow-hidden border"
              style={{ borderColor: "#EEEEEE", borderRadius: "4px" }}
            >
              <div
                className="h-auto w-24 shrink-0 border-r"
                style={{ backgroundColor: c.hex, borderRightColor: "#EEEEEE" }}
              />
              <div className="flex-1 space-y-1 px-4 py-3">
                <div className="font-mono text-sm font-semibold text-black">{c.name}</div>
                <div className="font-mono text-xs text-[color:var(--ds-gray)]">{c.hex}  ·  {c.hsl}</div>
                <div className="text-xs text-[color:var(--ds-gray)]">{c.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Stage badges */}
      <Section title="Stage badge palette" subtitle="Funnel-stage colors chosen inside the Hotel Plus palette. Order encodes progress.">
        <div className="flex flex-wrap items-center gap-3">
          {STAGES.map((s) => (
            <span
              key={s.stage}
              className="inline-flex items-center px-3 py-1 text-xs font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: s.bg,
                color: s.text,
                border: `1px solid ${s.border}`,
                borderRadius: "2px",
                ...(s.ring ? { boxShadow: `0 0 0 2px ${s.ring}` } : null),
              }}
            >
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-prose text-sm text-[color:var(--ds-gray)]">
          Sourced is intentionally subdued — it&apos;s entry, not yet engaged. Applied/Screening/Interview
          escalate yellow saturation. Offer inverts to black-on-yellow (terminal positive). Hired is white
          with a yellow ring (success without screaming). Rejected is fully gray (deactivated).
        </p>
      </Section>

      {/* Source badges */}
      <Section title="Source badges" subtitle="Inbound vs outbound — disambiguated by a yellow underline accent, not a separate color.">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: "#F8F8F8", color: "#000000", border: "1px solid #EEEEEE", borderRadius: "2px" }}
          >
            Inbound · email
          </span>
          <span
            className="inline-flex items-center px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: "#F8F8F8", color: "#000000", border: "1px solid #EEEEEE", borderBottom: "2px solid #FFD52B", borderRadius: "2px" }}
          >
            Outbound · LinkedIn
          </span>
          <span
            className="inline-flex items-center px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: "#F8F8F8", color: "#000000", border: "1px solid #EEEEEE", borderBottom: "2px solid #FFD52B", borderRadius: "2px" }}
          >
            Outbound · bookmarklet
          </span>
        </div>
      </Section>

      {/* Typography */}
      <Section title="Typography" subtitle="Spirit mimic — Montserrat for display, Inter for body, JetBrains Mono for IDs. Will look correct after Phase 1 font swap.">
        <div className="space-y-6">
          {TYPE_SPECIMENS.map((t) => (
            <div key={t.role} className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr] sm:items-baseline">
              <div className="space-y-0.5">
                <div className="font-mono text-xs font-semibold text-black">{t.role}</div>
                <div className="font-mono text-xs text-[color:var(--ds-gray)]">{t.family}</div>
              </div>
              <div className={t.sizeClass} style={{ color: "#000000" }}>{t.sample}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons" subtitle="Primary = yellow with black text (verified against sc2 CTAs). Secondary = black with white text. Ghost = transparent with black text. Destructive = red.">
        <div className="flex flex-wrap items-center gap-3">
          <DsButton variant="primary">Save changes</DsButton>
          <DsButton variant="primary-hover">Save changes (hover)</DsButton>
          <DsButton variant="secondary">Cancel</DsButton>
          <DsButton variant="ghost">View details</DsButton>
          <DsButton variant="destructive">Delete</DsButton>
          <DsButton variant="disabled">Save changes</DsButton>
        </div>
        <p className="mt-4 max-w-prose text-sm text-[color:var(--ds-gray)]">
          Yellow always means &quot;live&quot;. Disabled state strips yellow entirely (soft-gray bg, gray text).
          That preserves yellow&apos;s signal value across the UI.
        </p>
      </Section>

      {/* H+ logo + cards */}
      <Section title="H+ logo block + card patterns" subtitle="Two valid logo treatments depending on context. Cards stay flat with hairline borders.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* On-white card */}
          <div className="overflow-hidden border" style={{ borderColor: "#EEEEEE", borderRadius: "4px", backgroundColor: "#FFFFFF" }}>
            <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "#EEEEEE" }}>
              <HPlusBlock size={40} variant="on-white" />
              <div>
                <div className="text-lg font-bold tracking-tight">On white (card / page body)</div>
                <div className="text-xs text-[color:var(--ds-gray)]">bg-yellow · text-black</div>
              </div>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm" style={{ color: "#000000" }}>
              <p>Used inside cards, empty states, and any white-background surface.</p>
              <p className="text-[color:var(--ds-gray)]">Always rounded-none. Montserrat Black 900.</p>
            </div>
          </div>

          {/* On-yellow card */}
          <div className="overflow-hidden border" style={{ borderColor: "#000000", borderRadius: "4px", backgroundColor: "#FFD52B" }}>
            <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "#000000" }}>
              <HPlusBlock size={40} variant="on-yellow" />
              <div>
                <div className="text-lg font-bold tracking-tight">On yellow (nav bar)</div>
                <div className="text-xs" style={{ color: "#000000" }}>bg-black · text-yellow</div>
              </div>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm" style={{ color: "#000000" }}>
              <p>Used inside the dashboard top nav and any yellow-background surface.</p>
              <p>Sits as a black square against the yellow chrome.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Nav preview */}
      <Section title="Top nav preview" subtitle="Marketing-faithful — solid yellow bar with black text. The big visual change in Phase 3.">
        <div
          className="overflow-hidden border"
          style={{ borderColor: "#000000", borderRadius: "4px" }}
        >
          <div
            className="flex items-center justify-between px-6 py-3"
            style={{ backgroundColor: "#FFD52B", borderBottom: "1px solid #000000" }}
          >
            <div className="flex items-center gap-3">
              <HPlusBlock size={32} variant="on-yellow" />
              <span className="text-base font-bold tracking-tight" style={{ color: "#000000" }}>Acquisition</span>
            </div>
            <nav className="flex items-center gap-1 text-sm" style={{ color: "#000000" }}>
              {[
                { label: "Tracker", active: true },
                { label: "JDs" },
                { label: "Scraper" },
                { label: "Screener" },
                { label: "Schedule" },
                { label: "Activity" },
                { label: "Settings" },
              ].map((l) => (
                <span
                  key={l.label}
                  className="px-3 py-1.5 font-semibold"
                  style={l.active ? { backgroundColor: "#000000", color: "#FFD52B", borderRadius: "2px" } : undefined}
                >
                  {l.label}
                </span>
              ))}
            </nav>
            <span className="text-sm font-medium" style={{ color: "#000000" }}>benhoenig@gmail.com</span>
          </div>
          <div className="px-6 py-4 text-sm" style={{ backgroundColor: "#FFFFFF" }}>
            Body content stays white. Yellow only on chrome + primary CTAs.
          </div>
        </div>
      </Section>

      {/* Reference screenshots */}
      <Section title="Hotel Plus reference (side-by-side check)" subtitle="The source of truth. If a rebuilt surface doesn't visually echo at least one of these, something is off.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {SCREENSHOTS.map((s) => (
            <figure
              key={s.src}
              className="overflow-hidden border"
              style={{ borderColor: "#EEEEEE", borderRadius: "4px", backgroundColor: "#FFFFFF" }}
            >
              <div className="relative aspect-video w-full" style={{ backgroundColor: "#F8F8F8" }}>
                <Image
                  src={s.src}
                  alt={s.title}
                  fill
                  className="object-cover object-top"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  unoptimized
                />
              </div>
              <figcaption className="space-y-1 px-4 py-3">
                <div className="text-sm font-bold tracking-tight">{s.title}</div>
                <div className="text-xs text-[color:var(--ds-gray)]">{s.note}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <footer className="border-t pt-6 text-xs text-[color:var(--ds-gray)]" style={{ borderColor: "#EEEEEE" }}>
        <p>
          Source: <code className="font-mono">docs/redesign/design.md</code> ·
          Reference Wix CSS: <code className="font-mono">docs/redesign/hotelplus-html.txt</code> ·
          Plan: <code className="font-mono">~/.claude/plans/i-need-help-redesign-indexed-popcorn.md</code>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="max-w-prose text-sm text-[color:var(--ds-gray)]">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Badge({ children, pending = false }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={
        pending
          ? { backgroundColor: "#F8F8F8", color: "#707070", border: "1px solid #EEEEEE", borderRadius: "2px" }
          : { backgroundColor: "#FFD52B", color: "#000000", border: "1px solid #000000", borderRadius: "2px" }
      }
    >
      {children}
    </span>
  );
}

function HPlusBlock({ size, variant }: { size: number; variant: "on-white" | "on-yellow" }) {
  const onWhite = variant === "on-white";
  return (
    <div
      className="flex items-center justify-center font-black"
      style={{
        width: size,
        height: size,
        backgroundColor: onWhite ? "#FFD52B" : "#000000",
        color: onWhite ? "#000000" : "#FFD52B",
        fontSize: size * 0.5,
        lineHeight: 1,
        letterSpacing: "-0.04em",
      }}
    >
      H+
    </div>
  );
}

function DsButton({
  variant,
  children,
}: {
  variant: "primary" | "primary-hover" | "secondary" | "ghost" | "destructive" | "disabled";
  children: React.ReactNode;
}) {
  const styles: React.CSSProperties = (() => {
    switch (variant) {
      case "primary":
        return { backgroundColor: "#FFD52B", color: "#000000", border: "1px solid #FFD52B" };
      case "primary-hover":
        return { backgroundColor: "#FFCC00", color: "#000000", border: "1px solid #FFCC00" };
      case "secondary":
        return { backgroundColor: "#000000", color: "#FFFFFF", border: "1px solid #000000" };
      case "ghost":
        return { backgroundColor: "transparent", color: "#000000", border: "1px solid #EEEEEE" };
      case "destructive":
        return { backgroundColor: "#C42A2A", color: "#FFFFFF", border: "1px solid #C42A2A" };
      case "disabled":
        return { backgroundColor: "#EEEEEE", color: "#707070", border: "1px solid #EEEEEE", cursor: "not-allowed" };
    }
  })();
  return (
    <button
      type="button"
      disabled={variant === "disabled"}
      className="px-4 py-2 text-sm font-semibold"
      style={{ ...styles, borderRadius: "4px" }}
    >
      {children}
    </button>
  );
}
