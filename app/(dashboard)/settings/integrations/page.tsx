import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { ApiKeysPanel } from "./api-keys.client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations · Settings · Acquisition" };

const SCOPES = {
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  calendarFreebusy: "https://www.googleapis.com/auth/calendar.freebusy",
  gmailCompose: "https://www.googleapis.com/auth/gmail.compose",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
} as const;

type ScopeRow = {
  key: string;
  title: string;
  description: string;
  /** Granted iff every scope in this list is present. */
  scopes: string[];
};

const ROWS: ScopeRow[] = [
  {
    key: "calendar",
    title: "Google Calendar",
    description:
      "Create interview events with Meet links. Used by the Schedule page.",
    scopes: [SCOPES.calendarEvents, SCOPES.calendarFreebusy],
  },
  {
    key: "gmail_compose",
    title: "Gmail · Compose drafts",
    description:
      "Draft cold-outreach emails into your Drafts folder so you can review before sending.",
    scopes: [SCOPES.gmailCompose],
  },
  {
    key: "gmail_send",
    title: "Gmail · Send",
    description:
      "Send emails directly on your behalf. Only used when you click Send in-app.",
    scopes: [SCOPES.gmailSend],
  },
];

/**
 * Third-party API integration status. Email composer settings + the
 * capture bookmarklet moved to their own pages — this page now sticks
 * to its lane: API connections (Google OAuth + paid-service keys).
 */
export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: tokenRow }, { data: settingsRow }] = await Promise.all([
    admin
      .from("oauth_tokens")
      .select("scopes, expires_at, updated_at")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle(),
    admin
      .from("user_settings")
      .select(
        "proxycurl_api_key_encrypted, apify_api_token_encrypted, updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const granted = new Set<string>(
    (tokenRow?.scopes as string[] | undefined) ?? [],
  );
  const everythingMissing = !tokenRow;

  const apiKeyStatus = {
    proxycurlSaved: Boolean(settingsRow?.proxycurl_api_key_encrypted),
    proxycurlUpdatedAt: settingsRow?.updated_at
      ? (settingsRow.updated_at as string)
      : null,
    apifySaved: Boolean(settingsRow?.apify_api_token_encrypted),
    apifyUpdatedAt: settingsRow?.updated_at
      ? (settingsRow.updated_at as string)
      : null,
  };

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
          Integrations
        </h1>
        <p className="mt-1 text-sm text-black">
          Connect this app to Google (Calendar, Gmail) and the paid services
          that power outbound sourcing.
        </p>
      </div>

      {everythingMissing && (
        <div className="rounded-lg border border-dashed border-soft-gray bg-white/40 p-6">
          <p className="font-display text-lg text-black">
            No Google account connected
          </p>
          <p className="mt-1 max-w-2xl text-sm text-black">
            You&apos;re currently signed in with email — we don&apos;t hold any
            Google tokens for you. To grant Calendar + Gmail access, sign out
            and sign back in with Google. The OAuth consent screen lets you
            pick exactly which scopes to share.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/login">Sign in with Google</Link>
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-xl text-black">Google APIs</h2>
        <ul className="space-y-2">
          {ROWS.map((row) => {
            const hasAll = row.scopes.every((s) => granted.has(s));
            return (
              <li
                key={row.key}
                className="flex flex-col gap-2 rounded-md border border-soft-gray bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-black">{row.title}</p>
                  <p className="mt-1 text-xs text-black">{row.description}</p>
                </div>
                <div>
                  {hasAll ? (
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 text-xs font-medium text-success">
                      <span aria-hidden>✓</span> Granted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning/15 px-2 py-1 text-xs font-medium text-warning">
                      Not granted
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {tokenRow && (
          <div className="rounded-md border border-soft-gray bg-white/40 px-4 py-3 text-xs text-black">
            <p>
              <span className="text-black">Token last refreshed:</span>{" "}
              <span className="font-mono">
                {new Date(
                  (tokenRow.updated_at as string) ??
                    (tokenRow.expires_at as string),
                ).toLocaleString("en-GB", {
                  timeZone: "Asia/Bangkok",
                  hour12: false,
                })}
              </span>
            </p>
            <p className="mt-1 text-gray">
              Missing a scope? Sign out + sign back in with Google to
              re-trigger the consent screen. We never store more than what
              you grant.
            </p>
          </div>
        )}
      </section>

      <ApiKeysPanel status={apiKeyStatus} />
    </div>
  );
}
