import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { JdRow } from "@/lib/db/types";

export const metadata = { title: "Job Descriptions · Acquisition" };

export default async function JdsPage() {
  const supabase = await createClient();
  // List view only needs identification + the must-have count + threshold —
  // body_markdown (potentially several KB per JD) and the long persona
  // override columns aren't rendered here, so don't pay to ship them.
  const { data: jds, error } = await supabase
    .from("job_descriptions")
    .select("id, title, department, location, must_have, threshold")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium text-black">Job descriptions</h1>
          <p className="mt-1 text-sm text-black">
            Define the role, the must-haves, and the threshold. The Resume
            Screener scores candidates against this.
          </p>
        </div>
        <Button asChild>
          <Link href="/jds/new">+ New JD</Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <p className="font-mono">{error.message}</p>
        </div>
      ) : !jds || jds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-soft-gray bg-white/40 p-12 text-center">
          <p className="font-display text-xl text-black">No JDs yet</p>
          <p className="mt-2 text-sm text-black">
            Create one to start scoring candidates.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {(jds as Pick<JdRow, "id" | "title" | "department" | "location" | "must_have" | "threshold">[]).map((jd) => (
            <li key={jd.id}>
              <Link
                href={`/jds/${jd.id}`}
                className="flex items-center justify-between rounded-md border border-soft-gray bg-white px-4 py-3 transition-colors hover:bg-white"
              >
                <div>
                  <p className="font-medium text-black">{jd.title}</p>
                  <p className="text-xs text-black">
                    {[jd.department, jd.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="rounded-sm bg-off-white px-1.5 py-0.5 text-black">
                    {jd.must_have.length} must-have
                  </span>
                  <span className="rounded-sm bg-yellow-pale px-1.5 py-0.5 font-medium text-black">
                    threshold {jd.threshold}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
