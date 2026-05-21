import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JdEditor } from "../jd-editor.client";
import { SourceCandidatesDialog } from "./source-dialog.client";
import { SourcingHistory } from "./sourcing-history";
import type { JdRow } from "@/lib/db/types";

export const metadata = { title: "Edit JD · Acquisition" };

export default async function EditJdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: jd, error } = await supabase
    .from("job_descriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !jd) return notFound();
  const jdRow = jd as JdRow;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-black">Edit JD</h1>
          <p className="mt-1 text-sm text-black">
            Updating must-haves or the threshold will affect future scoring runs;
            existing scores keep their original `prompt_version` for traceability.
          </p>
        </div>
        <SourceCandidatesDialog jdId={jdRow.id} jdTitle={jdRow.title} />
      </div>
      <JdEditor mode="edit" initial={jdRow} />
      <SourcingHistory jdId={jdRow.id} />
    </div>
  );
}
