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
          <h1 className="font-display text-3xl font-medium text-navy">Job descriptions</h1>
          <p className="mt-1 text-sm text-charcoal">
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
        <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-12 text-center">
          <p className="font-display text-xl text-navy">No JDs yet</p>
          <p className="mt-2 text-sm text-charcoal">
            Create one to start scoring candidates.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {(jds as Pick<JdRow, "id" | "title" | "department" | "location" | "must_have" | "threshold">[]).map((jd) => (
            <li key={jd.id}>
              <Link
                href={`/jds/${jd.id}`}
                className="flex items-center justify-between rounded-md border border-sand-200 bg-warm-white px-4 py-3 transition-colors hover:bg-cream"
              >
                <div>
                  <p className="font-medium text-navy">{jd.title}</p>
                  <p className="text-xs text-slate-deep">
                    {[jd.department, jd.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="rounded-sm bg-sand-100 px-1.5 py-0.5 text-charcoal">
                    {jd.must_have.length} must-have
                  </span>
                  <span className="rounded-sm bg-terracotta-50 px-1.5 py-0.5 font-medium text-terracotta-700">
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
