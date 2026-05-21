import Image from "next/image";
import Link from "next/link";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
            <span className="font-sans text-lg font-bold tracking-tight text-black">
              Acquisition Pipeline
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-sm border border-black px-4 py-1.5 font-sans text-sm font-semibold text-black transition-colors hover:bg-black hover:text-yellow"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
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
