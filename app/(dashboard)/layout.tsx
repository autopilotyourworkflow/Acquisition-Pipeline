import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button.client";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated users, but belt-and-suspenders
  // for direct API hits that bypass middleware in edge cases.
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-sand-200 bg-warm-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <Link href="/tracker" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-terracotta font-display text-sm font-medium text-cream shadow-xs">
              H+
            </div>
            <span className="font-display text-lg text-navy">Acquisition</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <NavLink href="/tracker">Tracker</NavLink>
            <NavLink href="/candidates">Candidates</NavLink>
            <NavLink href="/scraper">Scraper</NavLink>
            <NavLink href="/screener">Screener</NavLink>
            <NavLink href="/schedule">Schedule</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-charcoal sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-10">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-charcoal transition-colors hover:bg-sand-100 hover:text-navy"
    >
      {children}
    </Link>
  );
}
