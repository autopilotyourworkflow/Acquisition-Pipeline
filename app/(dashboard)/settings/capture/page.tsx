import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    </div>
  );
}
