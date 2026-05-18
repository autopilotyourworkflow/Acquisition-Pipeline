import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";

/**
 * POST /api/audit/undo  { logId: string }
 *
 * Reverts the mutation captured by `logId` to its `before` state.
 *
 * Day-2 simplification: no conflict detection (we don't compare the current
 * row's hash to the recorded after_hash). Day 4 adds that — if the row has
 * been modified since this action, return 409 + diff prompt.
 *
 * Within-org permissive: any teammate can undo any teammate's action while
 * single-org. The activity_log records who did the undo via `undone_by`.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { logId?: string };
  try {
    body = (await req.json()) as { logId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.logId) {
    return NextResponse.json({ error: "logId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the audit row (service-role to bypass the SELECT-only-by-org policy
  // and grab everything we need in one query).
  const { data: log, error: fetchErr } = await admin
    .from("activity_log")
    .select("*")
    .eq("id", body.logId)
    .single();
  if (fetchErr || !log) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "Audit row not found" },
      { status: 404 },
    );
  }
  if (log.org_id !== ORG_ID) {
    return NextResponse.json({ error: "Not your org" }, { status: 403 });
  }
  if (log.undone_at) {
    return NextResponse.json({ error: "This action was already undone" }, { status: 409 });
  }

  const action = log.action as "insert" | "update" | "delete";
  const targetTable = log.target_table as string;
  const targetId = log.target_id as string;
  const before = log.before as Record<string, unknown> | null;
  const after = log.after as Record<string, unknown> | null;

  // Apply the inverse mutation. Service-role bypasses RLS so we can revert
  // even rows the user technically can't write to (e.g. soft-deleted JDs).
  try {
    if (action === "insert") {
      // Inverse of insert = delete the row.
      const { error } = await admin.from(targetTable).delete().eq("id", targetId);
      if (error) throw error;
    } else if (action === "update") {
      if (!before) throw new Error("Cannot undo update without before-state");
      // Strip non-restorable columns (timestamps, generated fields).
      const { created_at, updated_at, weighted_total, ...rest } =
        before as Record<string, unknown>;
      void created_at;
      void updated_at;
      void weighted_total;
      const { error } = await admin.from(targetTable).update(rest).eq("id", targetId);
      if (error) throw error;
    } else if (action === "delete") {
      if (!before) throw new Error("Cannot undo delete without before-state");
      const { error } = await admin.from(targetTable).insert(before);
      if (error) throw error;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Undo failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 500 },
    );
  }

  // Mark the original log row as undone, then insert a new log row pointing
  // at it via redo_of so the Redo path can find it later.
  const { error: markErr } = await admin
    .from("activity_log")
    .update({ undone_at: new Date().toISOString(), undone_by: user.id })
    .eq("id", body.logId);
  if (markErr) {
    return NextResponse.json(
      { error: `Mark-undone failed: ${markErr.message}` },
      { status: 500 },
    );
  }

  // Inverse log entry. The "after" of the undo is the original "before"
  // (we restored that state); the "before" of the undo is the original "after".
  const inverseAction: "insert" | "update" | "delete" =
    action === "insert" ? "delete" : action === "delete" ? "insert" : "update";

  await admin.from("activity_log").insert({
    org_id: ORG_ID,
    actor_id: user.id,
    action: inverseAction,
    target_table: targetTable,
    target_id: targetId,
    before: after,
    after: before,
    after_hash: null,
    redo_of: log.id,
  });

  return NextResponse.json({ ok: true });
}
