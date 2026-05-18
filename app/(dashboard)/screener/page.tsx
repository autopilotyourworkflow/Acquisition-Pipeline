import { createClient } from "@/lib/supabase/server";
import { ScreenerShell } from "./screener-shell.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

export const metadata = { title: "Screener · Acquisition" };

export default async function ScreenerPage() {
  const supabase = await createClient();

  const [{ data: candidates }, { data: jds }, { data: attachments }] = await Promise.all([
    supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("job_descriptions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("candidate_id, parsed_text")
      .eq("kind", "cv_pdf"),
  ]);

  // Tally parsed text length per candidate for the "X chars cached" UI hint.
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
        <h1 className="font-display text-3xl font-medium text-navy">Resume Screener</h1>
        <p className="mt-1 text-sm text-charcoal">
          Score a candidate against a JD with{" "}
          <span className="font-mono text-xs">claude-opus-4-7</span>. Output streams
          live; the final score row is persisted with telemetry + prompt version.
        </p>
      </div>

      <ScreenerShell
        candidates={(candidates ?? []) as CandidateRow[]}
        jds={(jds ?? []) as JdRow[]}
        parsedTextLengths={parsedTextLengths}
      />
    </div>
  );
}
