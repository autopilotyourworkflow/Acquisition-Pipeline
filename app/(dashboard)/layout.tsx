import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SignOutButton } from "./sign-out-button.client";
import { NavLink } from "./nav-link.client";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  // Middleware already redirects unauthenticated users, but belt-and-suspenders
  // for direct API hits that bypass middleware in edge cases.
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-yellow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-3">
          <Link href="/tracker" className="flex items-center gap-3">
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
          <nav className="flex items-center gap-1">
            <NavLink href="/tracker">Tracker</NavLink>
            <NavLink href="/jds">JDs</NavLink>
            <NavLink href="/scraper">Scraper</NavLink>
            <NavLink href="/screener">Screener</NavLink>
            <NavLink href="/schedule">Schedule</NavLink>
            <NavLink href="/activity">Activity</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-black/75 sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-10">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
