import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-sand-200 bg-warm-white">
        <div className="mx-auto flex max-w-7xl items-center px-8 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-terracotta font-display text-lg font-medium text-cream shadow-xs">
              H+
            </div>
            <span className="font-display text-xl text-navy">Acquisition</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
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
