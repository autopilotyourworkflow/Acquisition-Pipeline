export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-sand-200 bg-warm-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-terracotta font-display text-lg font-medium text-cream shadow-xs">
              H+
            </div>
            <span className="font-display text-xl text-navy">Acquisition</span>
          </div>
          <nav className="text-sm font-medium text-charcoal hover:text-navy">
            <a href="/login">Sign in</a>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-8 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-terracotta">
            Recruiting pipeline
          </span>
          <h1 className="mt-5 font-display text-5xl font-medium leading-[1.1] text-navy sm:text-6xl">
            Hire faster.
            <br />
            <span className="text-navy-soft">With every step recorded.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-charcoal">
            Source candidates from anywhere, score them with Claude, schedule
            interviews across calendars, and draft personalized outreach — all in
            one workflow your whole team can see.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <a
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-md bg-terracotta px-6 text-sm font-medium text-cream shadow-xs transition-colors hover:bg-terracotta-700"
            >
              Sign in
            </a>
            <a
              href="#features"
              className="inline-flex h-11 items-center justify-center rounded-md border border-sand-200 bg-warm-white px-6 text-sm font-medium text-navy transition-colors hover:bg-sand-100"
            >
              See how it works
            </a>
          </div>

          {/* Brand-token sanity strip — useful for verifying the design system renders.
              Will be removed once we ship real screens. */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              { label: "Applied / Contacted", className: "bg-sand-100 text-charcoal" },
              { label: "Screening", className: "bg-warning/15 text-warning" },
              { label: "Pre-screen", className: "bg-info/15 text-info" },
              { label: "Interview", className: "bg-info/25 text-info" },
              { label: "Offer", className: "bg-terracotta-50 text-terracotta-700" },
              { label: "Hired", className: "bg-success/15 text-success" },
            ].map((s) => (
              <span
                key={s.label}
                className={`inline-flex h-6 items-center rounded-sm px-2.5 font-medium ${s.className}`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-sand-200 bg-warm-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4 text-xs text-slate-mid">
          <span>
            Acquisition · Built for{" "}
            <a
              href="https://www.hotelplus.asia"
              className="text-charcoal underline-offset-4 hover:underline"
            >
              Hotel Plus
            </a>
          </span>
          <span className="font-mono">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}
