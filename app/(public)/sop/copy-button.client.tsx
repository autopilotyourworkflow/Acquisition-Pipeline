"use client";

import { useState } from "react";

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const ta = document.createElement("textarea");
        ta.value = markdown;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-sm border border-black bg-black px-4 py-2 font-sans text-sm font-semibold text-yellow transition-colors hover:bg-yellow hover:text-black"
    >
      {copied ? "✓ Copied" : "Copy as Markdown"}
    </button>
  );
}
