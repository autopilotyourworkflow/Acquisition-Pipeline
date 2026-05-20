"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (pathname?.startsWith(href + "/") ?? false);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "rounded-sm bg-black px-3 py-1.5 font-sans text-sm font-semibold text-yellow transition-colors"
          : "rounded-sm px-3 py-1.5 font-sans text-sm font-semibold text-black transition-colors hover:bg-black hover:text-yellow"
      }
    >
      {children}
    </Link>
  );
}
