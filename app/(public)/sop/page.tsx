import type { Metadata } from "next";
import {
  SOP_META,
  SOP_INTRO,
  SOP_SECTIONS,
  SOP_MARKDOWN,
  type SopBlock,
  type SopSection,
} from "./content";
import { CopyMarkdownButton } from "./copy-button.client";
import { TableOfContents } from "./table-of-contents.client";

export const metadata: Metadata = {
  title: SOP_META.title + " — Hotel Plus Recruiting",
  description:
    "Field manual for the Hotel Plus talent team. Twelve chapters covering login, integrations, JDs, sourcing, AI screening, the Tracker, cold emails, scheduling, and the audit log.",
  openGraph: {
    title: SOP_META.title + " — Hotel Plus Recruiting",
    description:
      "The Hotel Plus HR Standard Operating Procedure. Read it, share the link, or copy as Markdown to ask an AI about it.",
    type: "article",
  },
};

function renderBlock(block: SopBlock, key: number) {
  switch (block.kind) {
    case "p":
      return (
        <p key={key} className="mt-4 leading-7 text-black">
          {block.text}
        </p>
      );

    case "h3":
      return (
        <h3
          key={key}
          className="mt-8 mb-2 font-display text-lg font-semibold tracking-tight text-black"
        >
          {block.text}
        </h3>
      );

    case "ul":
      return (
        <ul
          key={key}
          className="mt-4 list-disc space-y-2 pl-6 leading-7 text-black marker:text-gray-dim"
        >
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol
          key={key}
          className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-black marker:text-gray-dim"
        >
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div
          key={key}
          className="mt-6 overflow-x-auto rounded border border-soft-gray"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="bg-off-white text-left">
              <tr>
                {block.headers.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-soft-gray px-4 py-2 font-sans font-semibold text-black"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-soft-gray last:border-b-0 hover:bg-yellow-pale/40"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2 align-top leading-6 text-black"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "mistakes":
      return (
        <aside
          key={key}
          className="mt-8 rounded border-l-4 border-yellow bg-yellow-pale/50 p-5"
        >
          <p className="font-display text-sm font-bold uppercase tracking-wider text-black">
            Common mistakes
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-black marker:text-black">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </aside>
      );

    case "callout":
      return (
        <aside
          key={key}
          className="mt-6 rounded border border-soft-gray bg-off-white p-5"
        >
          {block.title && (
            <p className="font-display text-base font-semibold text-black">
              {block.title}
            </p>
          )}
          <p className="mt-2 text-sm leading-6 text-black">{block.text}</p>
        </aside>
      );
  }
}

function renderSection(section: SopSection) {
  return (
    <section
      key={section.id}
      id={section.id}
      className="scroll-mt-24 border-t border-soft-gray pt-12 first:border-t-0 first:pt-0"
    >
      <p className="font-mono text-xs uppercase tracking-wider text-gray">
        Chapter {section.number}
      </p>
      <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-black">
        {section.title}
      </h2>
      {section.summary && (
        <p className="mt-3 text-base italic leading-7 text-gray">
          {section.summary}
        </p>
      )}
      {section.body.map(renderBlock)}
    </section>
  );
}

export default function SopPage() {
  const tocItems = SOP_SECTIONS.map((s) => ({
    id: s.id,
    number: s.number,
    title: s.title,
  }));

  return (
    <div className="bg-white">
      {/* Hero band */}
      <div className="border-b border-soft-gray bg-off-white">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
          <p className="font-mono text-xs uppercase tracking-wider text-gray">
            Standard Operating Procedure
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-black lg:text-5xl">
            {SOP_META.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray lg:text-lg">
            {SOP_META.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <CopyMarkdownButton markdown={SOP_MARKDOWN} />
            <span className="font-mono text-xs text-gray">
              Last updated · {SOP_META.lastUpdated}
            </span>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,720px)] lg:gap-16">
          <aside>
            <TableOfContents sections={tocItems} />
          </aside>

          <article>
            {/* Intro callout */}
            {SOP_INTRO.kind === "callout" && (
              <aside className="rounded border border-black bg-yellow-pale/40 p-6">
                {SOP_INTRO.title && (
                  <p className="font-display text-lg font-semibold text-black">
                    {SOP_INTRO.title}
                  </p>
                )}
                <p className="mt-2 text-sm leading-6 text-black">
                  {SOP_INTRO.text}
                </p>
              </aside>
            )}

            <div className="mt-12 space-y-12">
              {SOP_SECTIONS.map(renderSection)}
            </div>

            {/* Back to top */}
            <div className="mt-16 border-t border-soft-gray pt-8 text-center">
              <a
                href="#top"
                className="font-sans text-sm font-semibold text-gray hover:text-black"
              >
                ↑ Back to top
              </a>
              <p className="mt-4 font-mono text-xs text-gray">
                Send corrections to your team lead. This document is meant to
                evolve.
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
