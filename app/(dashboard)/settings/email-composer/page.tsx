import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { EmailDefaultsPanel } from "./email-defaults.client";

/**
 * Email composer defaults — per-user signature + from-name applied to
 * every cold-outreach email sent from this account. Plain text, no
 * encryption (not a credential). Forward-looking: this page is also
 * where Phase 4c (auto-email-reader) will house its sender filter
 * + default JD picker.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Email composer · Settings · Acquisition" };

export default async function EmailComposerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: settingsRow } = await admin
    .from("user_settings")
    .select("email_signature, email_from_name")
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
          Email composer
        </h1>
        <p className="mt-1 text-sm text-black">
          Defaults applied to every cold-outreach email sent from this
          account. Gmail still uses your real account as the sender —
          these just control how recipients see the message.
        </p>
      </div>

      <EmailDefaultsPanel
        initialSignature={(settingsRow?.email_signature as string | null) ?? null}
        initialFromName={(settingsRow?.email_from_name as string | null) ?? null}
      />
    </div>
  );
}
