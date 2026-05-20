"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  regenerateBookmarkletToken,
  clearBookmarkletToken,
} from "@/app/actions/bookmarklet";

/**
 * The bookmarklet JS source. Embeds the per-user token, posts the page
 * text to /api/scrape/bookmarklet, and pops a toast on the source page.
 * Designed to be small enough that the encoded form stays well under
 * any browser's URL-length limits.
 */
function buildBookmarkletHref(token: string, apiBase: string): string {
  const src = `(()=>{const T=${JSON.stringify(token)};const A=${JSON.stringify(apiBase + "/api/scrape/bookmarklet")};const N=(m,e)=>{const d=document.createElement('div');d.style.cssText='position:fixed;top:20px;right:20px;z-index:2147483647;background:'+(e?'#dc2626':'#BD5B3C')+';color:#fff;padding:14px 18px;border-radius:8px;font:500 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2);max-width:360px';d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),4500)};const t=document.body.innerText;if(!t||t.length<100){N('Page is empty — open a candidate detail page first.',1);return}N('Sending to Acquisition…',0);fetch(A,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},body:JSON.stringify({text:t,sourceUrl:location.href})}).then(r=>r.json()).then(d=>N(d.ok?'Added: '+d.full_name:'Failed: '+(d.error||'Unknown'),!d.ok)).catch(e=>N('Network error: '+e.message,1))})()`;
  return "javascript:" + encodeURIComponent(src);
}

export function BookmarkletPanel({
  hasToken,
  initialToken,
  apiBase,
}: {
  hasToken: boolean;
  /** Only set on the response of a regenerate — the page never re-renders
   *  the stored token. After a refresh the user has to regenerate to get
   *  a new draggable button. */
  initialToken: string | null;
  apiBase: string;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    startTransition(async () => {
      const r = await regenerateBookmarkletToken();
      if (!r.ok) {
        toast.error("Couldn't generate token", { description: r.error });
        return;
      }
      setToken(r.data.token);
      toast.success(
        "Bookmarklet ready — drag the button below to your bookmarks bar",
      );
      router.refresh();
    });
  }

  function clear() {
    if (
      !window.confirm(
        "Clear the bookmarklet token? Anyone who saved the bookmark will lose access.",
      )
    )
      return;
    startTransition(async () => {
      const r = await clearBookmarkletToken();
      if (!r.ok) {
        toast.error("Couldn't clear", { description: r.error });
        return;
      }
      setToken(null);
      toast.success("Bookmarklet cleared");
      router.refresh();
    });
  }

  return (
    <section className="rounded-md border border-sand-200 bg-warm-white px-4 py-4 space-y-4">
      <div>
        <h2 className="font-display text-xl text-navy">
          JobsDB / LinkedIn bookmarklet
        </h2>
        <p className="mt-1 text-sm text-charcoal">
          One-click candidate capture from any page where you&apos;re logged
          in — JobsDB applicant detail, LinkedIn profile, etc. Drag the
          button below to your browser&apos;s bookmarks bar, then click it
          while on a candidate page. We&apos;ll extract + score them.
        </p>
      </div>

      {hasToken && !token && (
        <div className="rounded-md border border-sand-200 bg-cream/40 px-3 py-2 text-xs text-charcoal">
          You already generated a bookmarklet (the saved bookmark in your
          browser still works). To see the draggable button again, regenerate
          below — that invalidates the existing bookmark.
        </div>
      )}

      {token && (
        <div className="rounded-md border border-terracotta/40 bg-terracotta/5 px-4 py-4 space-y-3">
          <p className="text-xs font-medium text-navy">
            ↓ Drag this button to your bookmarks bar:
          </p>
          {/* The <a> needs to keep its href on the rendered HTML so the
              browser sees it as a draggable bookmark. eslint-disable
              the no-script-url rule for this specific anchor. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={buildBookmarkletHref(token, apiBase)}
            draggable
            onClick={(e) => {
              // Don't navigate when clicked on our own settings page —
              // dragging is the only intended interaction here.
              e.preventDefault();
              toast.info("Drag this button to your bookmarks bar instead of clicking.");
            }}
            className="inline-block rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta/90 cursor-grab"
          >
            ➜ Send to Acquisition
          </a>
          <p className="text-[11px] text-slate-deep">
            Once dragged, the bookmark contains your private token. Anyone
            with that bookmark can post candidates as you — clear or
            regenerate below if it leaks.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={regenerate} disabled={pending}>
          {pending
            ? "Working…"
            : hasToken
              ? "Regenerate bookmarklet"
              : "Generate bookmarklet"}
        </Button>
        {hasToken && (
          <Button
            variant="outline"
            onClick={clear}
            disabled={pending}
            className="text-danger"
          >
            Clear
          </Button>
        )}
      </div>

      <details className="rounded-md border border-sand-200 bg-cream/30 px-3 py-2 text-xs">
        <summary className="cursor-pointer text-slate-deep">
          How it works
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-charcoal">
          <li>
            Generate the bookmarklet and drag the button to your browser&apos;s
            bookmarks bar. (View → Show Bookmarks Bar if it&apos;s hidden.)
          </li>
          <li>
            Go to a JobsDB applicant detail page (you must already be logged
            into JobsDB in this browser).
          </li>
          <li>
            Click the bookmarklet. A toast appears on the JobsDB page
            confirming the candidate was added.
          </li>
          <li>
            Open the Tracker — the new candidate is there with{" "}
            <span className="font-mono">source: jobsdb</span>. Run a score
            from the Screener.
          </li>
        </ol>
        <p className="mt-2 text-slate-mid">
          If JobsDB&apos;s security policy blocks the request (rare), the
          toast will say so. Fall back to the Scraper&apos;s paste tab in
          that case.
        </p>
      </details>
    </section>
  );
}
