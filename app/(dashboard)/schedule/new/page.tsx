import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { ScheduleShell, type ScheduleCandidate } from "./schedule-shell.client";
import type { CandidateRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New interview · Schedule · Acquisition" };

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export default async function ScheduleNewPage({
  searchParams,
}: {
  searchParams: Promise<{ candidate?: string }>;
}) {
  const params = await searchParams;
  const preselectedCandidateId = params.candidate ?? null;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Check Google connection status. Admin client because oauth_tokens is
  // restricted by RLS to the row owner — service-role lets us read it
  // server-side without juggling JWT context.
  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("oauth_tokens")
    .select("scopes")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  const grantedScopes = (tokenRow?.scopes as string[] | undefined) ?? [];
  const hasCalendarScope = grantedScopes.includes(CALENDAR_SCOPE);

  if (!tokenRow || !hasCalendarScope) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <NotConnectedEmptyState reason={!tokenRow ? "no_oauth" : "no_scope"} />
      </div>
    );
  }

  const { data: candidatesData } = await supabase
    .from("candidates")
    .select("id, full_name, email, current_title, stage, jd_id")
    .order("created_at", { ascending: false });
  const candidates = (candidatesData ?? []) as Pick<
    CandidateRow,
    "id" | "full_name" | "email" | "current_title" | "stage" | "jd_id"
  >[];

  const candidateIds = candidates.map((c) => c.id);
  const prepByCandidate = new Map<string, string[]>();
  if (candidateIds.length > 0) {
    const { data: scoresData } = await supabase
      .from("scores")
      .select("candidate_id, prep_questions, created_at")
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    for (const s of scoresData ?? []) {
      const cid = s.candidate_id as string;
      if (seen.has(cid)) continue;
      seen.add(cid);
      prepByCandidate.set(
        cid,
        (s.prep_questions as string[] | null) ?? [],
      );
    }
  }

  const shellCandidates: ScheduleCandidate[] = candidates.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    current_title: c.current_title,
    stage: c.stage,
    jd_id: c.jd_id,
    prep_questions: prepByCandidate.get(c.id) ?? [],
  }));

  const resolvedInitialId =
    preselectedCandidateId &&
    shellCandidates.some((c) => c.id === preselectedCandidateId)
      ? preselectedCandidateId
      : null;

  return (
    <div className="space-y-6">
      <PageHeader />
      <ScheduleShell
        candidates={shellCandidates}
        initialCandidateId={resolvedInitialId}
      />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <Link
        href="/schedule"
        className="text-xs text-black underline-offset-4 hover:underline"
      >
        ← Back to schedule
      </Link>
      <h1 className="mt-2 font-display text-3xl font-medium text-black">
        Schedule an interview
      </h1>
      <p className="mt-1 text-sm text-black">
        Drop an interview into Google Calendar with a Meet link. The candidate
        and any added invitees receive the calendar invite automatically.
      </p>
    </div>
  );
}

function NotConnectedEmptyState({
  reason,
}: {
  reason: "no_oauth" | "no_scope";
}) {
  return (
    <div className="rounded-lg border border-dashed border-soft-gray bg-white/40 p-10 text-center">
      <p className="font-display text-xl text-black">
        Google Calendar isn&apos;t connected
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-black">
        {reason === "no_oauth"
          ? "You signed in with email, so we don't have access to your Google account. Sign out and sign back in with Google to grant Calendar permissions."
          : "Your Google session is missing the Calendar Events scope. Sign out and sign back in with Google to grant it."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/settings/integrations">Open integrations</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Sign in with Google</Link>
        </Button>
      </div>
    </div>
  );
}
