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
          className="text-xs text-black underline-offset-4 hover:underline"
        >
          ← Back to settings
        </Link>
        <h1 className="mt-2 font-display text-3xl font-medium text-black">
          Capture
        </h1>
        <p className="mt-1 text-sm text-black">
          Tools for getting candidates INTO the system from sources we
          can&apos;t scrape headlessly.
        </p>
      </div>

      <BookmarkletPanel
        hasToken={Boolean(settingsRow?.bookmarklet_token)}
        initialToken={null}
        apiBase={getAppBaseUrl()}
      />

      {/* Phase 4c — auto-email-reader. Documented here as a small disclosure
          so the roadmap is visible without the full mockup form competing
          with the shipped bookmarklet for visual real estate. */}
      <details className="rounded-md border border-soft-gray bg-off-white/50 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-black">
          Roadmap · Auto-import from Gmail{" "}
          <span className="ml-1 rounded-sm bg-warning/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning">
            Phase 4c
          </span>
        </summary>
        <div className="mt-3 space-y-2 text-xs text-gray">
          <p>
            Planned: watch a user&apos;s Gmail inbox every 15 minutes for
            incoming applications, extract attached resumes, and auto-score
            them against a default JD. Opt-in, per user, fully revocable.
          </p>
          <p>
            Shape: a Vercel cron job hits{" "}
            <span className="font-mono">/api/cron/gmail-poll</span> with a
            shared secret; for each enabled config, it queries{" "}
            <span className="font-mono">gmail.users.messages.list?q=…</span>,
            dedups attachments by SHA-256, creates a{" "}
            <span className="font-mono">candidates</span> row with{" "}
            <span className="font-mono">source: &apos;email&apos;</span>, and
            triggers a single-mode score. Not shipped in the current
            submission.
          </p>
        </div>
      </details>
    </div>
  );
}
