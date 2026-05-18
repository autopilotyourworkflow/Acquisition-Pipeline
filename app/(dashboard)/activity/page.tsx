import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity · Acquisition" };
export const dynamic = "force-dynamic";

type ActivityRow = {
  id: string;
  actor_id: string;
  action: "insert" | "update" | "delete";
  target_table: string;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  after_hash: string | null;
  undone_at: string | null;
  created_at: string;
  users: { email: string; full_name: string | null } | null;
};

const ACTION_LABEL: Record<ActivityRow["action"], string> = {
  insert: "created",
  update: "updated",
  delete: "deleted",
};

const ACTION_CLASS: Record<ActivityRow["action"], string> = {
  insert: "bg-success/15 text-success",
  update: "bg-info/15 text-info",
  delete: "bg-danger/10 text-danger",
};

function summarize(row: ActivityRow): string {
  const after = row.after ?? {};
  const before = row.before ?? {};
  const subject =
    (after as { full_name?: string; title?: string }).full_name ??
    (after as { title?: string }).title ??
    (before as { full_name?: string; title?: string }).full_name ??
    (before as { title?: string }).title ??
    row.target_id.slice(0, 8);

  if (row.target_table === "candidates" && row.action === "update") {
    const b = (before as { stage?: string }).stage;
    const a = (after as { stage?: string }).stage;
    if (b && a && b !== a) return `${subject}: stage ${b} → ${a}`;
  }
  return String(subject);
}

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select(
      "id, actor_id, action, target_table, target_id, before, after, after_hash, undone_at, created_at, users:actor_id(email, full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Activity</h1>
        <p className="mt-1 text-sm text-charcoal">
          Every mutation that flows through <code className="font-mono text-xs">withAudit()</code>
          {" "}lands here. Day 4 turns each entry into an Undo button.
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
        <ul className="space-y-1">
          {(data as unknown as ActivityRow[]).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-md border border-sand-200 bg-warm-white px-4 py-2.5 text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${ACTION_CLASS[row.action]}`}
                >
                  {ACTION_LABEL[row.action]}
                </span>
                <span className="font-mono text-[11px] text-slate-mid">
                  {row.target_table}
                </span>
                <span className="text-navy">{summarize(row)}</span>
                {row.undone_at && (
                  <span className="rounded-sm bg-sand-100 px-1.5 py-0.5 text-[10px] text-charcoal">
                    undone
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-deep">
                <span>{row.users?.email ?? row.actor_id.slice(0, 8)}</span>
                <span className="font-mono text-slate-mid">
                  {new Date(row.created_at).toLocaleString("en-GB", {
                    timeZone: "Asia/Bangkok",
                    hour12: false,
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
