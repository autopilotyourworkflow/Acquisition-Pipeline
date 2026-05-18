import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Tracker · Acquisition",
};

export default async function TrackerPage() {
  const supabase = await createClient();

  // Fetch the seeded JD so we can verify RLS is working and the DB is wired.
  const { data: jds, error } = await supabase
    .from("job_descriptions")
    .select("id, title, location, threshold")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Tracker</h1>
        <p className="mt-1 text-sm text-charcoal">
          Your recruiting pipeline. Drag candidates between stages, score with
          Claude, and schedule interviews.
        </p>
      </div>

      <div className="rounded-lg border border-sand-200 bg-warm-white p-8 text-center">
        <p className="font-display text-xl text-navy">No candidates yet</p>
        <p className="mt-2 text-sm text-charcoal">
          The Kanban board lands on Day 2. For now, this page proves auth +
          Supabase are wired correctly.
        </p>
      </div>

      <section className="rounded-lg border border-sand-200 bg-warm-white p-6">
        <h2 className="font-display text-lg text-navy">Job descriptions</h2>
        <p className="mt-1 text-xs text-slate-deep">
          Read directly from Supabase (RLS-scoped to this org).
        </p>
        {error ? (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            <p className="font-medium">Supabase error</p>
            <p className="mt-1 font-mono">{error.message}</p>
            <p className="mt-2 text-charcoal">
              Likely cause: migration not yet applied. See{" "}
              <code className="font-mono">supabase/migrations/0001_init.sql</code>.
            </p>
          </div>
        ) : !jds || jds.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal">
            Migration applied but no JDs found. The seed inserts a Full Stack
            Developer JD — run the migration again or check your seed step.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {jds.map((jd) => (
              <li
                key={jd.id}
                className="flex items-center justify-between rounded-md border border-sand-200 bg-cream px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-navy">{jd.title}</p>
                  <p className="text-xs text-slate-deep">{jd.location}</p>
                </div>
                <span className="rounded-sm bg-terracotta-50 px-2 py-0.5 text-[11px] font-medium text-terracotta-700">
                  threshold {jd.threshold}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
