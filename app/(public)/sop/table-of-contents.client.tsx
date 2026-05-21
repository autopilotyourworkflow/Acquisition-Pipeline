"use client";

import { useEffect, useState } from "react";

type TocItem = { id: string; number: string; title: string };

export function TableOfContents({ sections }: { sections: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: 0,
      },
    );

    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const handleMobileLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const details = e.currentTarget.closest("details");
    if (details) details.open = false;
  };

  return (
    <>
      {/* Mobile: collapsed by default, doesn't eat the viewport */}
      <details className="mb-8 rounded border border-soft-gray bg-off-white p-4 lg:hidden">
        <summary className="cursor-pointer select-none font-sans text-sm font-semibold text-black">
          Contents
        </summary>
        <nav className="mt-4">
          <ol className="space-y-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={"#" + s.id}
                  onClick={handleMobileLinkClick}
                  className="block font-sans text-sm text-gray hover:text-black"
                >
                  <span className="mr-2 font-mono text-xs text-gray-dim">
                    {s.number}.
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>

      {/* Desktop: sticky sidebar with scroll-spy */}
      <nav
        aria-label="On this page"
        className="sticky top-24 hidden lg:block"
      >
        <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-wider text-gray">
          On this page
        </p>
        <ol className="space-y-2 border-l border-soft-gray">
          {sections.map((s) => {
            const isActive = activeId === s.id;
            return (
              <li key={s.id}>
                <a
                  href={"#" + s.id}
                  className={
                    isActive
                      ? "-ml-px block border-l-2 border-black pl-3 font-sans text-sm font-semibold text-black"
                      : "block pl-3 font-sans text-sm text-gray hover:text-black"
                  }
                >
                  <span className="mr-2 font-mono text-xs text-gray-dim">
                    {s.number}.
                  </span>
                  {s.title}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
