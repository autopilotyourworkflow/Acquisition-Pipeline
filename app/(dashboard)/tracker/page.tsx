import { createClient } from "@/lib/supabase/server";
import { TrackerViews } from "./tracker-views.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

export const metadata = {
  title: "Tracker · Acquisition",
};

export default async function TrackerPage() {
  const supabase = await createClient();

  const [{ data: candidates, error: cErr }, { data: jds, error: jErr }] = await Promise.all([
    supabase
      .from("candidates")
      .select("*, job_descriptions(title)")
      .order("created_at", { ascending: false }),
    supabase
      .from("job_descriptions")
      .select("*")
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

  const flattened = (candidates ?? []).map((row) => {
    const { job_descriptions, ...rest } = row as CandidateRow & {
      job_descriptions: { title: string } | null;
    };
    return {
      ...(rest as CandidateRow),
      jd_title: job_descriptions?.title ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Tracker</h1>
        <p className="mt-1 text-sm text-charcoal">
          Your recruiting pipeline. Drag candidates between stages — every move
          is captured in the activity log.
        </p>
      </div>

      <TrackerViews candidates={flattened} jds={(jds ?? []) as JdRow[]} />
    </div>
  );
}
