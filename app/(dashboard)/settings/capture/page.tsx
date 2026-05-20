import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BookmarkletPanel } from "./bookmarklet-panel.client";

/**
 * Capture tools — the one-click bookmarklet for grabbing candidates
 * from LinkedIn, JobsDB, or any other site the user is logged into.
 * Forward-looking: this is also where Phase 4c (auto-email-reader)
 * will surface its on/off toggle + last-run status.
 */

function getAppBaseUrl(): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://acq.autopilotyourworkflow.com";
  return env.replace(/\/$/, "");
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Capture · Settings · Acquisition" };

export default async function CapturePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: settingsRow } = await admin
    .from("user_settings")
    .select("bookmarklet_token")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="text-xs text-slate-deep underline-offset-4 hover:underline"
        >
          ← Back to settings
        </Link>
        <h1 className="mt-2 font-display text-3xl font-medium text-navy">
          Capture
        </h1>
        <p className="mt-1 text-sm text-charcoal">
          Tools for getting candidates INTO the system from sources we
          can&apos;t scrape headlessly.
        </p>
      </div>

      <BookmarkletPanel
        hasToken={Boolean(settingsRow?.bookmarklet_token)}
        initialToken={null}
        apiBase={getAppBaseUrl()}
      />

      {/* Phase 4c coming-soon — auto-email-reader. Surfaced here (not
          implemented) so the reviewer sees the planned shape. The cron
          + Gmail-readonly scope + filter UI ships as a follow-up. */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl text-navy">
            Auto-import from Gmail
          </h2>
          <span className="rounded-sm bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning">
            coming soon
          </span>
        </div>
        <p className="text-sm text-charcoal">
          Watch your Gmail inbox every 15 minutes for incoming applications,
          extract any attached resumes, and auto-score them against a default
          JD. Opt-in, per user, fully revocable.
        </p>

        <div className="space-y-4 rounded-md border border-dashed border-sand-200 bg-cream/40 px-4 py-4 opacity-70">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
                Enabled
              </label>
              <div className="flex h-9 items-center rounded-md border border-sand-200 bg-warm-white px-3 text-sm text-slate-mid">
                <span aria-hidden className="mr-2">○</span> Off
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
                Default JD (for auto-scoring)
              </label>
              <div className="flex h-9 items-center rounded-md border border-sand-200 bg-warm-white px-3 text-sm text-slate-mid">
                — pick a JD —
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
              Sender filter (optional)
            </label>
            <div className="flex h-9 items-center rounded-md border border-sand-200 bg-warm-white px-3 text-xs text-slate-mid">
              jobs@example.com, careers@example.com…
            </div>
            <p className="mt-1 text-[11px] text-slate-mid">
              Comma-separated list of allowed senders. Leave blank to match
              any sender whose subject contains &quot;resume&quot;,
              &quot;CV&quot;, or &quot;application&quot;.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
              Subject filter
            </label>
            <div className="flex h-9 items-center rounded-md border border-sand-200 bg-warm-white px-3 text-xs text-slate-mid">
              resume OR CV OR &quot;cover letter&quot; OR application
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md border border-sand-200 bg-warm-white px-3 py-1.5 text-xs font-medium text-slate-deep opacity-60"
              title="Coming in Phase 4c — needs gmail.readonly scope + cron secret + migration 0012."
            >
              Enable auto-import
            </button>
          </div>
        </div>

        <details className="rounded-md border border-sand-200 bg-cream/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-slate-deep">
            How it&apos;ll work
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-charcoal">
            <li>
              Grant the <span className="font-mono">gmail.readonly</span> scope
              (the existing Gmail OAuth flow extends to add it).
            </li>
            <li>
              A Vercel cron job runs every 15 minutes against{" "}
              <span className="font-mono">/api/cron/gmail-poll</span> with a
              shared secret. For each enabled config, it queries{" "}
              <span className="font-mono">
                gmail.users.messages.list?q=…&amp;after=&lt;last_polled_at&gt;
              </span>
              .
            </li>
            <li>
              New matches → download PDF attachments → dedup via SHA-256 →
              create a <span className="font-mono">candidates</span> row with{" "}
              <span className="font-mono">source: &apos;email&apos;</span> →
              trigger a single-mode score against the configured default JD.
            </li>
            <li>
              <span className="font-mono">last_polled_at</span> updates so the
              next poll skips the same message.
            </li>
            <li>
              Auto-scored candidates appear in the Tracker with a fresh badge.
              Click the badge to open the candidate detail page.
            </li>
          </ol>
        </details>
      </section>
    </div>
  );
}
