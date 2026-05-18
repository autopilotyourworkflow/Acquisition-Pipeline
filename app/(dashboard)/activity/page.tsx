import { createClient } from "@/lib/supabase/server";
import { ActivityList, type ActivityRow } from "./activity-list.client";

export const metadata = { title: "Activity · Acquisition" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select(
      "id, actor_id, action, target_table, target_id, before, after, after_hash, undone_at, redo_of, created_at, users:actor_id(email, full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Activity</h1>
        <p className="mt-1 text-sm text-charcoal">
          Every mutation that flows through <code className="font-mono text-xs">withAudit()</code> lands here.
          Undo reverts the row to its <code className="font-mono text-xs">before</code> state. Available for actions in the last 30 minutes.
          Conflict detection (when someone else has modified the row since) comes in Day 4.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <p className="font-mono">{error.message}</p>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-12 text-center">
          <p className="font-display text-xl text-navy">No activity yet</p>
          <p className="mt-2 text-sm text-charcoal">
            Add a candidate or drag a card — the action will appear here.
          </p>
        </div>
      ) : (
        <ActivityList rows={data as unknown as ActivityRow[]} />
      )}
    </div>
  );
}
