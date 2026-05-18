import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JdEditor } from "../jd-editor.client";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Edit JD</h1>
        <p className="mt-1 text-sm text-charcoal">
          Updating must-haves or the threshold will affect future scoring runs;
          existing scores keep their original `prompt_version` for traceability.
        </p>
      </div>
      <JdEditor mode="edit" initial={jd as JdRow} />
    </div>
  );
}
