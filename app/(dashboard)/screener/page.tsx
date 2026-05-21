import { createClient } from "@/lib/supabase/server";
import { ScreenerShell, type PastScore } from "./screener-shell.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

export const metadata = { title: "Screener · Acquisition" };
export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const supabase = await createClient();

  const [
    { data: candidates },
    { data: jds },
    { data: attachments },
    { data: scores },
  ] = await Promise.all([
    supabase.from("candidates").select("*").order("created_at", { ascending: false }),
    supabase.from("job_descriptions").select("*").order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("candidate_id, parsed_text")
      .eq("kind", "cv_pdf"),
    supabase
      .from("scores")
      .select(
        "id, candidate_id, jd_id, skills_score, experience_score, culture_score, weighted_total, reasoning, strengths, gaps, prep_questions, hiring_report, model, prompt_version, scoring_mode, cost_usd, created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const parsedTextLengths: Record<string, number> = {};
  for (const a of attachments ?? []) {
    const cid = a.candidate_id as string | null;
    if (!cid) continue;
    parsedTextLengths[cid] = Math.max(
      parsedTextLengths[cid] ?? 0,
      (a.parsed_text as string | null)?.length ?? 0,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-black">Resume Screener</h1>
        <p className="mt-1 text-sm text-black">
          Pick a candidate + JD, run a score. Every run is saved — the latest is
          shown below, past runs are kept for comparison.
        </p>
      </div>

      <ScreenerShell
        candidates={(candidates ?? []) as CandidateRow[]}
        jds={(jds ?? []) as JdRow[]}
        parsedTextLengths={parsedTextLengths}
        pastScores={(scores ?? []) as unknown as PastScore[]}
      />
    </div>
  );
}
