import { createClient } from "@/lib/supabase/server";
import { TrackerViews } from "./tracker-views.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

export const metadata = {
  title: "Tracker · Acquisition",
};

export default async function TrackerPage() {
  const supabase = await createClient();

  const [
    { data: candidates, error: cErr },
    { data: jds, error: jErr },
    { data: scores },
  ] = await Promise.all([
    // Trim the select to only the columns the Kanban + Table views actually
    // render. Dropping raw_profile alone can cut 50-500KB off the response
    // for orgs with many scraped LinkedIn profiles, since that column can
    // hold the full JSON dump per candidate.
    supabase
      .from("candidates")
      .select(
        "id, org_id, full_name, email, phone, current_title, location, linkedin_url, source, source_url, stage, jd_id, applied_at, created_at, updated_at, job_descriptions(title)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("job_descriptions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("scores")
      .select("candidate_id, weighted_total, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (cErr || jErr) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-medium text-navy">Tracker</h1>
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <p className="font-medium">Failed to load tracker data.</p>
          <p className="mt-1 font-mono">{cErr?.message ?? jErr?.message}</p>
        </div>
      </div>
    );
  }

  // Build a "latest score per candidate" lookup. Scores are already ordered
  // by created_at desc, so the first hit per candidate_id is the latest.
  const latestScoreByCandidate: Record<string, number> = {};
  for (const s of scores ?? []) {
    const cid = s.candidate_id as string;
    if (latestScoreByCandidate[cid] === undefined) {
      latestScoreByCandidate[cid] = Number(s.weighted_total);
    }
  }

  const flattened = (candidates ?? []).map((row) => {
    // Cast through unknown because we deliberately trimmed the select to
    // omit raw_profile / notes / row_hash / created_by (perf win).
    const { job_descriptions, ...rest } = row as unknown as CandidateRow & {
      job_descriptions: { title: string } | null;
    };
    return {
      ...(rest as CandidateRow),
      jd_title: job_descriptions?.title ?? null,
      latest_score: latestScoreByCandidate[row.id] ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Tracker</h1>
        <p className="mt-1 text-sm text-charcoal">
          Your recruiting pipeline. Drag candidates between stages — every move
          is captured in the activity log. Click a card to see candidate detail.
        </p>
      </div>

      <TrackerViews candidates={flattened} jds={(jds ?? []) as JdRow[]} />
    </div>
  );
}
