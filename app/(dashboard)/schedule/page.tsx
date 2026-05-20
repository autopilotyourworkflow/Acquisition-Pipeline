import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reconcileWithGoogle } from "@/lib/google/calendar";
import { Button } from "@/components/ui/button";
import {
  ScheduleOverview,
  type OverviewInterview,
} from "./schedule-overview.client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule · Acquisition" };

type InterviewWithJoins = {
  id: string;
  candidate_id: string;
  jd_id: string | null;
  stage: string;
  status: "scheduled" | "rescheduled" | "completed" | "cancelled" | "no_show";
  starts_at: string;
  ends_at: string;
  meet_url: string | null;
  description: string | null;
  candidates: { full_name: string; email: string | null } | null;
  job_descriptions: { title: string } | null;
};

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Sync DB ↔ Google before reading: if HR deleted an event directly in
  // Google Calendar, the row gets marked cancelled here so the rendered
  // list reflects reality. Auth-degrades silently for email-OTP users
  // (no Google scope = no reconciliation = no-op).
  await reconcileWithGoogle({ userId: user.id });

  const { data: interviewsData } = await supabase
    .from("interviews")
    .select(
      "id, candidate_id, jd_id, stage, status, starts_at, ends_at, meet_url, description, candidates(full_name, email), job_descriptions(title)",
    )
    .order("starts_at", { ascending: true });

  const rows = (interviewsData ?? []) as unknown as InterviewWithJoins[];

  const interviews: OverviewInterview[] = rows.map((r) => ({
    id: r.id,
    candidateId: r.candidate_id,
    candidateName: r.candidates?.full_name ?? "(deleted candidate)",
    candidateEmail: r.candidates?.email ?? null,
    jdTitle: r.job_descriptions?.title ?? null,
    stage: r.stage,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    meetUrl: r.meet_url,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium text-navy">
            Schedule
          </h1>
          <p className="mt-1 text-sm text-charcoal">
            All scheduled interviews. Toggle between calendar and list to scan
            availability or drill into details.
          </p>
        </div>
        <Button asChild>
          <Link href="/schedule/new">Schedule interview</Link>
        </Button>
      </div>

      <ScheduleOverview interviews={interviews} />
    </div>
  );
}
