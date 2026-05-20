import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { ApiKeysPanel } from "./api-keys.client";
import { BookmarkletPanel } from "./bookmarklet-panel.client";
import { EmailDefaultsPanel } from "./email-defaults.client";

function getAppBaseUrl(): string {
  // Resolves to the deployed origin in prod (set in Vercel as
  // NEXT_PUBLIC_APP_URL or VERCEL_URL). Falls back to the production
  // domain so the bookmarklet always targets a real endpoint.
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://acq.autopilotyourworkflow.com";
  return env.replace(/\/$/, "");
}

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
      "Draft cold-outreach emails into your Drafts folder so you can review before sending. Phase 4.",
    scopes: [SCOPES.gmailCompose],
  },
  {
    key: "gmail_send",
    title: "Gmail · Send",
    description:
      "Send emails directly on your behalf. Only used when you click Send in-app. Phase 4.",
    scopes: [SCOPES.gmailSend],
  },
];

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // oauth_tokens has owner-only RLS — read it via admin client so the page
  // works regardless of how the JWT is plumbed through server context.
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
        "proxycurl_api_key_encrypted, apify_api_token_encrypted, bookmarklet_token, email_signature, email_from_name, updated_at",
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
          className="text-xs text-slate-deep underline-offset-4 hover:underline"
        >
          ← Back to settings
        </Link>
        <h1 className="mt-2 font-display text-3xl font-medium text-navy">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-charcoal">
          Per-scope status for the Google APIs this app uses.
        </p>
      </div>

      {everythingMissing && (
        <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-6">
          <p className="font-display text-lg text-navy">
            No Google account connected
          </p>
          <p className="mt-1 max-w-2xl text-sm text-charcoal">
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

      <ul className="space-y-2">
        {ROWS.map((row) => {
          const hasAll = row.scopes.every((s) => granted.has(s));
          return (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-md border border-sand-200 bg-warm-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-navy">{row.title}</p>
                <p className="mt-1 text-xs text-charcoal">{row.description}</p>
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
        <div className="rounded-md border border-sand-200 bg-cream/40 px-4 py-3 text-xs text-charcoal">
          <p>
            <span className="text-slate-deep">Token last refreshed:</span>{" "}
            <span className="font-mono">
              {new Date(
                (tokenRow.updated_at as string) ?? (tokenRow.expires_at as string),
              ).toLocaleString("en-GB", {
                timeZone: "Asia/Bangkok",
                hour12: false,
              })}
            </span>
          </p>
          <p className="mt-1 text-slate-mid">
            Missing a scope? Sign out + sign back in with Google to re-trigger
            the consent screen. We never store more than what you grant.
          </p>
        </div>
      )}

      <ApiKeysPanel status={apiKeyStatus} />

      <EmailDefaultsPanel
        initialSignature={(settingsRow?.email_signature as string | null) ?? null}
        initialFromName={(settingsRow?.email_from_name as string | null) ?? null}
      />

      <BookmarkletPanel
        hasToken={Boolean(settingsRow?.bookmarklet_token)}
        initialToken={null}
        apiBase={getAppBaseUrl()}
      />
    </div>
  );
}
