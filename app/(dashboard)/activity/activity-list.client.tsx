"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ActivityRow = {
  id: string;
  actor_id: string;
  action: "insert" | "update" | "delete";
  target_table: string;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  after_hash: string | null;
  undone_at: string | null;
  redo_of: string | null;
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

// Undo only meaningful within 30 minutes of the action (plan default).
// Older entries are read-only audit history.
function canUndo(row: ActivityRow): boolean {
  if (row.undone_at) return false;
  if (row.redo_of) return false; // undo entries themselves aren't undoable here
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  return ageMs < 30 * 60 * 1000;
}

export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onUndo(row: ActivityRow) {
    if (!window.confirm(`Undo "${ACTION_LABEL[row.action]} ${row.target_table}"?`)) return;
    setPendingId(row.id);
    startTransition(async () => {
      const resp = await fetch("/api/audit/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logId: row.id }),
      });
      const json = await resp.json().catch(() => ({}));
      setPendingId(null);
      if (!resp.ok) {
        toast.error("Undo failed", { description: json?.error ?? `HTTP ${resp.status}` });
        return;
      }
      toast.success("Reverted");
      router.refresh();
    });
  }

  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const undoable = canUndo(row);
        return (
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
              {row.redo_of && (
                <span className="rounded-sm bg-info/15 px-1.5 py-0.5 text-[10px] text-info">
                  undo entry
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
              {undoable && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pendingId === row.id}
                  onClick={() => onUndo(row)}
                >
                  {pendingId === row.id ? "Reverting…" : "Undo"}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
