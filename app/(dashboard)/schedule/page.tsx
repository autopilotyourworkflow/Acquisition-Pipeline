import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { ScheduleShell, type ScheduleCandidate } from "./schedule-shell.client";
import type { CandidateRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule · Acquisition" };

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  // Fetch candidates (for the picker) and their latest score's prep_questions
  // (to surface as the auto-filled description). One query per surface;
  // small dataset so no concern over n+1.
  const { data: candidatesData } = await supabase
    .from("candidates")
    .select("id, full_name, email, current_title, stage, jd_id")
    .order("created_at", { ascending: false });
  const candidates = (candidatesData ?? []) as Pick<
    CandidateRow,
    "id" | "full_name" | "email" | "current_title" | "stage" | "jd_id"
  >[];

  // For each candidate, look up the prep_questions from their latest score.
  // We do this in one query and group in memory.
  const candidateIds = candidates.map((c) => c.id);
  let prepByCandidate = new Map<string, string[]>();
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

  return (
    <div className="space-y-6">
      <PageHeader />
      <ScheduleShell candidates={shellCandidates} />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-navy">Schedule</h1>
      <p className="mt-1 text-sm text-charcoal">
        Drop an interview into Google Calendar with a Meet link and prep
        questions pre-filled from the candidate&apos;s latest score.
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
    <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-10 text-center">
      <p className="font-display text-xl text-navy">
        Google Calendar isn&apos;t connected
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-charcoal">
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
