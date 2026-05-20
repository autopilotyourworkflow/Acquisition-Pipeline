import { createAdminClient } from "@/lib/supabase/admin";
import { SOURCING_PLATFORM_LABELS } from "@/lib/sourcing/types";
import type { SourcingPlatform } from "@/lib/sourcing/types";

type SourcingRunRow = {
  id: string;
  platforms: SourcingPlatform[];
  n_requested: number;
  n_found: number;
  cost_usd: number | string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

/**
 * Last 5 sourcing runs for a given JD. Server-rendered next to the JD
 * editor so HR can see the cost + result trail without leaving the page.
 */
export async function SourcingHistory({ jdId }: { jdId: string }) {
  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("sourcing_runs")
    .select("id, platforms, n_requested, n_found, cost_usd, status, started_at, finished_at, error")
    .eq("jd_id", jdId)
    .order("started_at", { ascending: false })
    .limit(5);

  const rows = (runs ?? []) as SourcingRunRow[];

  return (
    <section className="rounded-lg border border-sand-200 bg-warm-white p-6">
      <h2 className="font-display text-lg text-navy">Recent sourcing runs</h2>
      <p className="mt-1 text-xs text-slate-deep">
        Last 5 outbound runs against this JD.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-mid">
          No sourcing runs yet. Click <em>Find candidates for this JD</em> to
          start one.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-sand-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-deep">
                    {new Date(r.started_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Bangkok",
                      hour12: false,
                    })}
                  </span>
                  <span className="text-charcoal">
                    {r.platforms.map((p) => SOURCING_PLATFORM_LABELS[p]).join(", ")}
                  </span>
                  <StatusPill status={r.status} />
                </div>
                <div className="text-xs text-slate-deep font-mono">
                  {r.n_found}/{r.n_requested} found · ${Number(r.cost_usd).toFixed(2)}
                </div>
              </div>
              {r.error && (
                <p className="mt-1 text-xs text-danger">{r.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: SourcingRunRow["status"] }) {
  const cls =
    status === "done"
      ? "bg-success/10 text-success"
      : status === "failed"
        ? "bg-danger/10 text-danger"
        : "bg-warning/10 text-warning";
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
