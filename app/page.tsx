import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-yellow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.jpg"
              alt="Hotel Plus"
              width={40}
              height={40}
              priority
              className="h-10 w-10 object-contain"
            />
            <span className="font-display text-lg font-bold tracking-tight text-black">
              Acquisition Pipeline
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-sm px-3 py-1.5 font-sans text-sm font-semibold text-black transition-colors hover:bg-black hover:text-yellow"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-8 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray">
            Recruiting pipeline
          </p>
          <h1 className="mt-6 font-display text-5xl font-black leading-[1.05] tracking-tight text-black sm:text-7xl">
            Hire faster.
            <br />
            With every step recorded.
          </h1>
          <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-gray">
            Built for Hotel Plus.
          </p>
          <div className="mt-12">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-sm bg-yellow px-8 text-sm font-semibold tracking-wide text-black transition-[filter] hover:brightness-95"
            >
              Sign in →
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-black">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5 text-xs text-white/70">
          <span>
            Acquisition Pipeline · Built for{" "}
            <a
              href="https://www.hotelplus.asia"
              className="font-semibold text-yellow underline-offset-4 hover:underline"
            >
              Hotel Plus
            </a>
          </span>
          <span className="font-mono text-gray-dim">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}
