import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interview prep · Acquisition" };

/**
 * Staff-only prep briefing for an upcoming interview. Linked from the
 * Google Calendar invite description via a short link — the candidate sees
 * the URL but the destination requires an authenticated org member, so they
 * can't actually view the contents. RLS does the heavy lifting; this page
 * only renders if the user can SELECT the interview row.
 */
export default async function InterviewPrepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/interviews/${id}/prep`);

  const { data: interview, error: iErr } = await supabase
    .from("interviews")
    .select(
      "id, candidate_id, jd_id, stage, status, starts_at, ends_at, meet_url, candidates(full_name, email, phone, current_title, linkedin_url), job_descriptions(title, threshold)",
    )
    .eq("id", id)
    .single();
  if (iErr || !interview) return notFound();

  // Try to find the latest score for this candidate against the interview's
  // JD. If that turns up empty — either the interview has no JD or the
  // candidate was never scored against this particular JD — fall back to
  // the candidate's most recent score regardless of JD, and flag the
  // mismatch so the interviewer knows the prep is from another role.
  //
  // The previous version did a single .eq("jd_id", interview.jd_id) which
  // failed against null jd_ids (SQL `= NULL` is never true) and returned
  // nothing even when the candidate had perfectly good prep questions on a
  // score row.
  const SCORE_COLS =
    "id, jd_id, weighted_total, skills_score, experience_score, culture_score, reasoning, strengths, gaps, prep_questions, hiring_report, model, scoring_mode, created_at";

  let latestScore: Record<string, unknown> | null = null;
  let scoreFromDifferentJd = false;

  if (interview.jd_id) {
    const { data } = await supabase
      .from("scores")
      .select(SCORE_COLS)
      .eq("candidate_id", interview.candidate_id as string)
      .eq("jd_id", interview.jd_id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestScore = data as Record<string, unknown> | null;
  }

  if (!latestScore) {
    const { data } = await supabase
      .from("scores")
      .select(SCORE_COLS)
      .eq("candidate_id", interview.candidate_id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestScore = data as Record<string, unknown> | null;
    scoreFromDifferentJd =
      !!latestScore && !!interview.jd_id && latestScore.jd_id !== interview.jd_id;
  }

  // If the fallback score came from a different JD, fetch that JD's title
  // so the mismatch banner names it explicitly.
  let fallbackJdTitle: string | null = null;
  if (scoreFromDifferentJd && latestScore?.jd_id) {
    const { data: otherJd } = await supabase
      .from("job_descriptions")
      .select("title")
      .eq("id", latestScore.jd_id as string)
      .maybeSingle();
    fallbackJdTitle = (otherJd?.title as string | undefined) ?? null;
  }

  // Supabase typed joins come back as arrays-or-singles depending on
  // relation; cast through unknown to read the join fields cleanly.
  const candidate = (
    interview as unknown as {
      candidates: {
        full_name: string;
        email: string | null;
        phone: string | null;
        current_title: string | null;
        linkedin_url: string | null;
      } | null;
    }
  ).candidates;
  const jd = (
    interview as unknown as {
      job_descriptions: { title: string; threshold: number } | null;
    }
  ).job_descriptions;

  const prepQuestions =
    (latestScore?.prep_questions as string[] | null) ?? [];
  const strengths = (latestScore?.strengths as string[] | null) ?? [];
  const gaps = (latestScore?.gaps as string[] | null) ?? [];

  const start = new Date(interview.starts_at as string);
  const end = new Date(interview.ends_at as string);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/candidates/${interview.candidate_id}`}
          className="text-xs text-slate-deep underline-offset-4 hover:underline"
        >
          ← Back to candidate
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-deep">
              Interviewer prep · internal
            </p>
            <h1 className="mt-1 font-display text-3xl font-medium text-navy">
              {candidate?.full_name ?? "(candidate)"}
            </h1>
            <p className="mt-1 text-sm text-charcoal">
              {jd?.title ?? "(no JD)"}
              {candidate?.current_title ? ` · was ${candidate.current_title}` : ""}
            </p>
          </div>
          <div className="text-right text-xs text-charcoal">
            <p className="font-mono">
              {start.toLocaleString("en-GB", {
                timeZone: "Asia/Bangkok",
                hour12: false,
                weekday: "short",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-0.5 text-slate-mid">
              {durationMin} min · {String(interview.status).replace("_", " ")}
            </p>
            {interview.meet_url && (
              <a
                href={interview.meet_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[11px] font-medium text-terracotta-700 underline-offset-4 hover:underline"
              >
                Join Google Meet →
              </a>
            )}
          </div>
        </div>
      </div>

      {prepQuestions.length > 0 ? (
        <section className="rounded-lg border border-sand-200 bg-warm-white p-5">
          <h2 className="font-display text-xl text-navy">Prep questions</h2>
          <p className="mt-1 text-xs text-slate-deep">
            Generated by the screener. Use as a starting point — adapt to
            the conversation.
          </p>
          {scoreFromDifferentJd && (
            <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              ⚠ These prep questions come from a score against{" "}
              <span className="font-medium">
                {fallbackJdTitle ?? "a different JD"}
              </span>
              , not this interview&apos;s JD ({jd?.title ?? "—"}). Use with
              judgment, or run a fresh score for the right JD.
            </p>
          )}
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-charcoal marker:text-terracotta">
            {prepQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-6 text-center text-sm text-slate-mid">
          No prep questions yet. Run a score for this candidate against{" "}
          {jd?.title ? <span className="font-medium">{jd.title}</span> : "the JD"}{" "}
          first.
        </section>
      )}

      {latestScore && (
        <section className="rounded-lg border border-sand-200 bg-warm-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl text-navy">Score snapshot</h2>
            <span className="font-mono text-xs text-slate-deep">
              {latestScore.model as string} · {latestScore.scoring_mode as string}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <ScoreStat
              label="Overall"
              value={latestScore.weighted_total as number}
              threshold={jd?.threshold ?? null}
            />
            <ScoreStat label="Skills" value={latestScore.skills_score as number} />
            <ScoreStat
              label="Experience"
              value={latestScore.experience_score as number}
            />
            <ScoreStat
              label="Culture"
              value={latestScore.culture_score as number}
            />
          </div>
          {(strengths.length > 0 || gaps.length > 0) && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {strengths.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-deep">
                    Strengths
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-charcoal marker:text-success">
                    {strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {gaps.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-deep">
                    Gaps to probe
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-charcoal marker:text-warning">
                    {gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-md border border-dashed border-sand-200 bg-cream/40 p-4 text-xs text-slate-mid">
        This page is staff-only. The link from the Google Calendar invite
        sends candidates here too, but they can&apos;t authenticate into this
        org so they&apos;ll be bounced to the login screen.
      </section>
    </div>
  );
}

function ScoreStat({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number;
  threshold?: number | null;
}) {
  const passes = threshold !== null && threshold !== undefined ? value >= threshold : null;
  return (
    <div className="rounded-md border border-sand-200 bg-cream/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-deep">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-medium text-navy">
        {value.toFixed(1)}
      </p>
      {passes !== null && (
        <p
          className={
            "mt-0.5 text-[10px] font-medium uppercase " +
            (passes ? "text-success" : "text-warning")
          }
        >
          {passes ? "passes" : "below threshold"}
        </p>
      )}
    </div>
  );
}
