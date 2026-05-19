import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "@/components/screener/ScoreCard";
import type { CandidateRow, JdRow, ScoreRow, AttachmentRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Storage bucket holding PDFs (and screenshots, eventually). Private — view
 * access is granted per-request via createSignedUrl with a short TTL so a
 * leaked HTML page can't expose a permanent link.
 */
const STORAGE_BUCKET = "cvs";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export const dynamic = "force-dynamic";

type ScoreWithJd = ScoreRow & { job_descriptions: { title: string; threshold: number } | null };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", id)
    .single();
  return { title: `${data?.full_name ?? "Candidate"} · Acquisition` };
}

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: candidate, error: cErr },
    { data: jd },
    { data: scores },
    { data: attachments },
  ] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", id).single(),
    supabase.from("job_descriptions").select("*"),
    supabase
      .from("scores")
      .select(
        "*, job_descriptions(title, threshold)",
      )
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attachments")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (cErr || !candidate) return notFound();

  const c = candidate as CandidateRow;
  const allJds = (jd ?? []) as JdRow[];
  const allScores = (scores ?? []) as unknown as ScoreWithJd[];
  const allAttachments = (attachments ?? []) as AttachmentRow[];

  // Mint short-lived signed URLs so the user can preview/download each
  // attachment. Two flavors per attachment:
  //   - viewUrl: inline (no Content-Disposition) → browser PDF viewer
  //   - downloadUrl: forces save with the original filename so even when the
  //     inline viewer chokes on a malformed response, the user can still
  //     get the file out.
  // Admin client because storage policies on `cvs` bucket are managed at the
  // bucket level — keeping this server-side keeps the bucket private (no
  // permanent links leak).
  const attachmentLinks = await Promise.all(
    allAttachments.map(async (a) => {
      const admin = createAdminClient();
      // Strip the hash/timestamp prefix from the stored filename for a
      // friendlier download experience.
      const tail = a.storage_path.split("/").pop() ?? "attachment.pdf";
      const friendlyName = tail.replace(/^(?:[a-f0-9]{64}|\d{13})-/, "");
      const [view, download] = await Promise.all([
        admin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS),
        admin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS, {
            download: friendlyName,
          }),
      ]);
      return {
        id: a.id,
        viewUrl: view.data?.signedUrl ?? null,
        downloadUrl: download.data?.signedUrl ?? null,
        friendlyName,
      };
    }),
  );
  const linkById = new Map(
    attachmentLinks.map((l) => [
      l.id,
      { viewUrl: l.viewUrl, downloadUrl: l.downloadUrl, friendlyName: l.friendlyName },
    ]),
  );

  // Group scores by JD so multiple runs against the same JD cluster together.
  const scoresByJd = new Map<string, ScoreWithJd[]>();
  for (const s of allScores) {
    const key = s.jd_id;
    if (!scoresByJd.has(key)) scoresByJd.set(key, []);
    scoresByJd.get(key)!.push(s);
  }

  const candidateJd = c.jd_id ? allJds.find((j) => j.id === c.jd_id) ?? null : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/tracker"
          className="text-xs text-slate-deep underline-offset-4 hover:underline"
        >
          ← Back to tracker
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-medium text-navy">
              {c.full_name}
            </h1>
            <p className="mt-1 text-sm text-charcoal">
              {c.current_title ?? "No title on file"}
              {c.location ? ` · ${c.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StageBadge stage={c.stage} />
            <SourceBadge source={c.source} />
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-sand-200 bg-warm-white p-5">
        <p className="mb-3 text-xs uppercase tracking-wide text-slate-deep">
          Contact
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <ContactRow label="Email" value={c.email} />
          <ContactRow label="Phone" value={c.phone} />
          <ContactRow
            label="LinkedIn"
            value={c.linkedin_url}
            href={c.linkedin_url ?? undefined}
          />
          <ContactRow label="Applied" value={c.applied_at} />
          <ContactRow label="JD" value={candidateJd?.title ?? "Unassigned"} />
          <ContactRow
            label="Source URL"
            value={c.source_url}
            href={c.source_url ?? undefined}
          />
        </dl>
        {c.notes && (
          <div className="mt-4 border-t border-sand-100 pt-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-deep">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm text-charcoal">{c.notes}</p>
          </div>
        )}
      </section>

      <ExtractedProfileSection rawProfile={c.raw_profile} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-navy">Attachments</h2>
          <Link href="/screener" className="text-xs text-terracotta-700 underline-offset-4 hover:underline">
            Upload from Screener →
          </Link>
        </div>
        {allAttachments.length === 0 ? (
          <p className="rounded-md border border-dashed border-sand-200 bg-cream/40 px-4 py-6 text-center text-sm text-slate-mid">
            No CV or screenshot uploaded yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {allAttachments.map((a) => {
              const links = linkById.get(a.id);
              const friendlyName = links?.friendlyName ?? a.storage_path.split("/").pop();
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sand-200 bg-warm-white px-4 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-sm bg-sand-100 px-1.5 py-0.5 font-mono text-[10px] text-charcoal">
                      {a.kind}
                    </span>
                    <span className="text-navy">{friendlyName}</span>
                    {a.parsed_text && (
                      <span className="text-[11px] text-slate-mid">
                        {a.parsed_text.length.toLocaleString()} chars cached
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {links?.viewUrl ? (
                      <a
                        href={links.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-terracotta-700 underline-offset-4 hover:underline"
                      >
                        View
                      </a>
                    ) : null}
                    {links?.downloadUrl ? (
                      <a
                        href={links.downloadUrl}
                        className="text-[11px] font-medium text-terracotta-700 underline-offset-4 hover:underline"
                      >
                        Download
                      </a>
                    ) : null}
                    {!links?.viewUrl && !links?.downloadUrl && (
                      <span className="text-[11px] text-slate-mid">
                        link unavailable
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-slate-deep">
                      {new Date(a.created_at).toLocaleString("en-GB", {
                        timeZone: "Asia/Bangkok",
                        hour12: false,
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-navy">Scoring history</h2>
          <Button asChild>
            <Link href={`/screener?candidate=${c.id}`}>Run a new score</Link>
          </Button>
        </div>

        {scoresByJd.size === 0 ? (
          <p className="rounded-md border border-dashed border-sand-200 bg-cream/40 px-4 py-8 text-center text-sm text-charcoal">
            No scores yet. Run one from the{" "}
            <Link href="/screener" className="text-terracotta-700 underline">
              Screener
            </Link>
            .
          </p>
        ) : (
          [...scoresByJd.entries()].map(([jdId, jdScores]) => {
            const jdTitle = jdScores[0]?.job_descriptions?.title ?? "Deleted JD";
            const threshold = jdScores[0]?.job_descriptions?.threshold ?? null;
            const latest = jdScores[0];
            return (
              <div key={jdId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-navy">
                    {jdTitle}
                    {threshold !== null && (
                      <span className="ml-2 text-[11px] text-slate-mid">
                        threshold {threshold}
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-slate-deep">
                    {jdScores.length} run{jdScores.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ScoreCard
                  data={{
                    scoreId: latest.id,
                    skills_score: latest.skills_score,
                    experience_score: latest.experience_score,
                    culture_score: latest.culture_score,
                    weighted_total: latest.weighted_total,
                    reasoning: latest.reasoning,
                    strengths: latest.strengths,
                    gaps: latest.gaps,
                    prep_questions: latest.prep_questions,
                    hiring_report: latest.hiring_report ?? "",
                    passes_threshold:
                      threshold !== null ? latest.weighted_total >= threshold : null,
                    cost_usd: latest.cost_usd ?? undefined,
                  }}
                />
                {jdScores.length > 1 && (
                  <details className="rounded-md border border-sand-200 bg-warm-white">
                    <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
                      Previous runs ({jdScores.length - 1} more)
                    </summary>
                    <ul className="divide-y divide-sand-100 border-t border-sand-100">
                      {jdScores.slice(1).map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between px-4 py-2 text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-base font-medium text-navy">
                              {r.weighted_total.toFixed(2)}
                            </span>
                            <span className="text-[11px] text-slate-deep">
                              {new Date(r.created_at).toLocaleString("en-GB", {
                                timeZone: "Asia/Bangkok",
                                hour12: false,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-mid">
                            <span className="font-mono">{r.model}</span>
                            <span
                              className={cn(
                                "rounded-sm px-1.5 py-0.5",
                                r.scoring_mode === "team"
                                  ? "bg-terracotta-50 text-terracotta-700"
                                  : "bg-sand-100",
                              )}
                            >
                              {r.scoring_mode}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

/**
 * Surface everything the scraper extracted into raw_profile + the original
 * source content (pasted text / PDF filename / URL) so the user can see
 * where this candidate came from. Renders nothing if there's no useful data.
 */
type ScraperSourceShape =
  | { kind: "paste"; text?: string }
  | { kind: "url"; url?: string }
  | { kind: "pdf"; filename?: string; size?: number }
  | { kind: "screenshot"; filename?: string }
  | { kind: "thirdparty"; linkedinUrl?: string }
  | null
  | undefined;

type ExperienceEntry = {
  company?: string;
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  // Legacy: prose paragraph captured before the schema was split.
  summary?: string | null;
  // Current: distinct accomplishments, one per array element. Renders as a
  // bullet list.
  bullets?: string[];
};

type EducationEntry = {
  institution?: string;
  degree?: string | null;
  field?: string | null;
  end_year?: number | null;
};

function ExtractedProfileSection({
  rawProfile,
}: {
  rawProfile: Record<string, unknown> | null;
}) {
  if (!rawProfile) return null;

  const source = rawProfile.scraper_source as ScraperSourceShape;
  const skills = Array.isArray(rawProfile.skills)
    ? (rawProfile.skills as string[]).filter((s) => typeof s === "string" && s)
    : [];
  const experience = Array.isArray(rawProfile.experience)
    ? (rawProfile.experience as ExperienceEntry[])
    : [];
  const education = Array.isArray(rawProfile.education)
    ? (rawProfile.education as EducationEntry[])
    : [];
  const detectedLanguage =
    typeof rawProfile.detected_language === "string"
      ? (rawProfile.detected_language as string)
      : null;

  // For PDF sources, the file itself lives in the Attachments section below
  // (with View / Download links), so the source-content dropdown here would
  // just duplicate filename info. Hide it specifically for kind=pdf.
  const showSource = source && source.kind !== "pdf";

  const hasAnything =
    showSource ||
    skills.length > 0 ||
    experience.length > 0 ||
    education.length > 0 ||
    detectedLanguage;

  if (!hasAnything) return null;

  return (
    <section className="space-y-4 rounded-lg border border-sand-200 bg-warm-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-navy">Extracted profile</h2>
        {detectedLanguage && (
          <span className="rounded-sm bg-sand-100 px-1.5 py-0.5 font-mono text-[10px] text-charcoal">
            lang: {detectedLanguage}
          </span>
        )}
      </div>

      {showSource && source && (
        <details className="rounded-md border border-sand-200 bg-cream/40">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
            Source content ({source.kind})
          </summary>
          <div className="border-t border-sand-200 px-4 py-3 text-xs">
            {source.kind === "paste" && source.text && (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-charcoal">
                {source.text}
              </pre>
            )}
            {source.kind === "url" && source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-terracotta-700 underline-offset-4 hover:underline"
              >
                {source.url}
              </a>
            )}
            {source.kind === "thirdparty" && source.linkedinUrl && (
              <a
                href={source.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-terracotta-700 underline-offset-4 hover:underline"
              >
                {source.linkedinUrl}
              </a>
            )}
            {source.kind === "screenshot" && source.filename && (
              <p className="font-mono text-charcoal">{source.filename}</p>
            )}
          </div>
        </details>
      )}

      {skills.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-deep">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="rounded-sm bg-sand-100 px-2 py-0.5 text-xs text-charcoal"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-deep">
            Experience
          </p>
          <ul className="space-y-2">
            {experience.map((e, i) => {
              const bullets = Array.isArray(e.bullets)
                ? e.bullets.filter((b) => typeof b === "string" && b.trim())
                : [];
              // When the model returned both `bullets` and a `summary`, the
              // bullets carry the value and the summary tends to be a
              // redundant intro line — rendering it as an unbulleted
              // paragraph above the bullets looked like a missed bullet.
              // Drop it when bullets exist; only fall back to summary as
              // prose when there are no bullets at all (legacy rows).
              const hasBullets = bullets.length > 0;
              const fallbackSummary = !hasBullets && e.summary ? e.summary : null;
              return (
                <li
                  key={i}
                  className="rounded-md border border-sand-200 bg-cream/40 p-3 text-sm"
                >
                  <p className="font-medium text-navy">
                    {e.title ?? "—"}
                    {e.company ? (
                      <span className="text-slate-deep"> @ {e.company}</span>
                    ) : null}
                  </p>
                  {(e.start_date || e.end_date) && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-mid">
                      {e.start_date ?? "?"} → {e.end_date ?? "present"}
                    </p>
                  )}
                  {hasBullets && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-charcoal marker:text-terracotta">
                      {bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                  {fallbackSummary && (
                    <p className="mt-1 whitespace-pre-wrap text-charcoal">
                      {fallbackSummary}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {education.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-deep">
            Education
          </p>
          <ul className="space-y-2">
            {education.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-sand-200 bg-cream/40 p-3 text-sm"
              >
                <p className="font-medium text-navy">
                  {e.institution ?? "—"}
                </p>
                {(e.degree || e.field || e.end_year) && (
                  <p className="mt-0.5 text-charcoal">
                    {[e.degree, e.field].filter(Boolean).join(" · ")}
                    {e.end_year ? (
                      <span className="ml-1 font-mono text-[11px] text-slate-mid">
                        {e.end_year}
                      </span>
                    ) : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ContactRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs text-slate-deep">{label}</dt>
      <dd className="text-sm text-navy">
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-mid">—</span>
        )}
      </dd>
    </div>
  );
}
