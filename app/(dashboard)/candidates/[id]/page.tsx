import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import { Button } from "@/components/ui/button";
import { InterviewActions } from "@/components/interviews/InterviewActions.client";
import { ScoreCard } from "@/components/screener/ScoreCard";
import { ColdEmailLauncher } from "@/components/emails/ColdEmailLauncher.client";
import { DeleteCandidateButton } from "./delete-candidate-button.client";
import type { PastEmail } from "@/components/emails/ColdEmailDialog.client";
import type { CandidateRow, JdRow, ScoreRow, AttachmentRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/**
 * Storage bucket holding PDFs (and screenshots, eventually). Private — view
 * access is granted per-request via createSignedUrl with a short TTL so a
 * leaked HTML page can't expose a permanent link.
 */
const STORAGE_BUCKET = "cvs";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export const dynamic = "force-dynamic";

type ScoreWithJd = ScoreRow & { job_descriptions: { title: string; threshold: number } | null };

type InterviewWithJd = {
  id: string;
  candidate_id: string;
  jd_id: string | null;
  stage: string;
  status: "scheduled" | "rescheduled" | "completed" | "cancelled" | "no_show";
  starts_at: string;
  ends_at: string;
  meet_url: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  description: string | null;
  organizer_id: string;
  created_at: string;
  updated_at: string;
  job_descriptions: { title: string } | null;
};

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
  // Single source-of-truth timestamp for "is this interview upcoming?"
  // decisions on this page render. Server Components run once per request,
  // so Date.now() here is request-scoped — semantically equivalent to a
  // request header. The React purity rule doesn't distinguish server vs.
  // client components though, hence the targeted disable.
  // eslint-disable-next-line react-hooks/purity
  const pageRenderTime = Date.now();

  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const admin = createAdminClient();
  const [
    { data: candidate, error: cErr },
    { data: jd },
    { data: scores },
    { data: attachments },
    { data: interviews },
    { data: tokenRow },
    { data: pastEmails },
    { data: userSettings },
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
    supabase
      .from("interviews")
      .select("*, job_descriptions(title)")
      .eq("candidate_id", id)
      .order("starts_at", { ascending: true }),
    // oauth_tokens has owner-only RLS — admin client sidesteps that and lets
    // the page render correctly regardless of how the JWT is plumbed through
    // the server-component request context.
    user
      ? admin
          .from("oauth_tokens")
          .select("scopes")
          .eq("user_id", user.id)
          .eq("provider", "google")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Past cold-email drafts + sends for this candidate. Threaded into the
    // ColdEmailLauncher so the dialog's history panel renders without an
    // extra round-trip on open.
    supabase
      .from("emails")
      .select(
        "id, status, subject, body_markdown, rationale, sent_at, gmail_message_id, created_at, updated_at",
      )
      .eq("candidate_id", id)
      .in("status", ["drafted", "sent"])
      .order("created_at", { ascending: false })
      .limit(10),
    // User's saved signature. Threaded into the ColdEmailLauncher so the
    // dialog can show a read-only preview of what gets appended at send.
    user
      ? admin
          .from("user_settings")
          .select("email_signature")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const grantedScopes = new Set<string>(
    (tokenRow?.scopes as string[] | undefined) ?? [],
  );
  const hasGmailSend = grantedScopes.has(GMAIL_SEND_SCOPE);

  if (cErr || !candidate) return notFound();

  const c = candidate as CandidateRow;
  const allJds = (jd ?? []) as JdRow[];
  const allScores = (scores ?? []) as unknown as ScoreWithJd[];
  const allAttachments = (attachments ?? []) as AttachmentRow[];
  const allInterviews = (interviews ?? []) as InterviewWithJd[];

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
          className="text-xs text-black underline-offset-4 hover:underline"
        >
          ← Back to tracker
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-medium text-black">
              {c.full_name}
            </h1>
            <p className="mt-1 text-sm text-black">
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

      <section className="rounded-lg border border-soft-gray bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-black">
            Contact
          </p>
          <ColdEmailLauncher
            candidate={{
              id: c.id,
              full_name: c.full_name,
              email: c.email,
              current_stage: c.stage,
            }}
            jdId={candidateJd?.id ?? null}
            jdTitle={candidateJd?.title ?? null}
            hasGmailSend={hasGmailSend}
            pastEmails={
              candidateJd
                ? ((pastEmails ?? []).filter(
                    (e) =>
                      e.status === "drafted" || e.status === "sent",
                  ) as unknown as PastEmail[])
                : []
            }
            signature={
              (userSettings?.email_signature as string | null)?.trim() || null
            }
          />
        </div>
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
          <div className="mt-4 border-t border-off-white pt-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-black">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm text-black">{c.notes}</p>
          </div>
        )}
      </section>

      <InterviewsSection
        interviews={allInterviews}
        candidateId={c.id}
        now={pageRenderTime}
      />

      <ExtractedProfileSection rawProfile={c.raw_profile} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-black">Source &amp; attachments</h2>
          <Link href="/screener" className="text-xs text-black underline-offset-4 hover:underline">
            Upload from Screener →
          </Link>
        </div>
        {allAttachments.length === 0 && !c.raw_profile?.scraper_source ? (
          <p className="rounded-md border border-dashed border-soft-gray bg-white/40 px-4 py-6 text-center text-sm text-gray">
            No CV, screenshot, or scraper source on file.
          </p>
        ) : allAttachments.length === 0 ? null : (
          <ul className="space-y-1">
            {allAttachments.map((a) => {
              const links = linkById.get(a.id);
              const friendlyName = links?.friendlyName ?? a.storage_path.split("/").pop();
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-soft-gray bg-white px-4 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-sm bg-off-white px-1.5 py-0.5 font-mono text-[10px] text-black">
                      {a.kind}
                    </span>
                    <span className="text-black">{friendlyName}</span>
                    {a.parsed_text && (
                      <span className="text-[11px] text-gray">
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
                        className="text-[11px] font-medium text-black underline-offset-4 hover:underline"
                      >
                        View
                      </a>
                    ) : null}
                    {links?.downloadUrl ? (
                      <a
                        href={links.downloadUrl}
                        className="text-[11px] font-medium text-black underline-offset-4 hover:underline"
                      >
                        Download
                      </a>
                    ) : null}
                    {!links?.viewUrl && !links?.downloadUrl && (
                      <span className="text-[11px] text-gray">
                        link unavailable
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-black">
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
        <ScraperSourceDropdown rawProfile={c.raw_profile} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-black">Scoring history</h2>
          <Button asChild>
            <Link href={`/screener?candidate=${c.id}`}>Run a new score</Link>
          </Button>
        </div>

        {scoresByJd.size === 0 ? (
          <p className="rounded-md border border-dashed border-soft-gray bg-white/40 px-4 py-8 text-center text-sm text-black">
            No scores yet. Run one from the{" "}
            <Link href="/screener" className="text-black underline">
              Screener
            </Link>
            .
          </p>
        ) : (
          [...scoresByJd.entries()].map(([jdId, jdScores]) => {
            const jdTitle = jdScores[0]?.job_descriptions?.title ?? "Deleted JD";
            const threshold = jdScores[0]?.job_descriptions?.threshold ?? null;
            return (
              <div key={jdId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-black">
                    {jdTitle}
                    {threshold !== null && (
                      <span className="ml-2 text-[11px] text-gray">
                        threshold {threshold}
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-black">
                    {jdScores.length} run{jdScores.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {jdScores.map((r, idx) => {
                    const isLatest = idx === 0;
                    const passesThreshold =
                      threshold !== null ? r.weighted_total >= threshold : null;
                    return (
                      <li key={r.id}>
                        <details
                          className="group rounded-md border border-soft-gray bg-white"
                          open={isLatest}
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-base font-medium text-black">
                                {r.weighted_total.toFixed(2)}
                              </span>
                              <span className="text-[11px] text-black">
                                {new Date(r.created_at).toLocaleString("en-GB", {
                                  timeZone: "Asia/Bangkok",
                                  hour12: false,
                                })}
                              </span>
                              {isLatest && (
                                <span className="rounded-sm bg-yellow-pale px-1.5 py-0.5 font-mono text-[10px] font-medium text-black">
                                  latest
                                </span>
                              )}
                              {passesThreshold !== null && (
                                <span
                                  className={cn(
                                    "rounded-sm px-1.5 py-0.5 font-mono text-[10px]",
                                    passesThreshold
                                      ? "bg-success/10 text-success"
                                      : "bg-warning/15 text-warning",
                                  )}
                                >
                                  {passesThreshold ? "passes" : "below threshold"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray">
                              <span className="font-mono">{r.model}</span>
                              <span
                                className={cn(
                                  "rounded-sm px-1.5 py-0.5",
                                  r.scoring_mode === "team"
                                    ? "bg-yellow-pale text-black"
                                    : "bg-off-white",
                                )}
                              >
                                {r.scoring_mode}
                              </span>
                            </div>
                          </summary>
                          <div className="border-t border-off-white p-4">
                            <ScoreCard
                              data={{
                                scoreId: r.id,
                                skills_score: r.skills_score,
                                experience_score: r.experience_score,
                                culture_score: r.culture_score,
                                weighted_total: r.weighted_total,
                                reasoning: r.reasoning,
                                strengths: r.strengths,
                                gaps: r.gaps,
                                prep_questions: r.prep_questions,
                                hiring_report: r.hiring_report ?? "",
                                passes_threshold: passesThreshold,
                                cost_usd: r.cost_usd ?? undefined,
                              }}
                            />
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="flex items-center justify-between rounded-md border border-soft-gray bg-off-white/50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray">
            Danger zone
          </p>
          <p className="mt-0.5 text-xs text-gray">
            Removes the candidate from the tracker. Reversible from the
            activity log.
          </p>
        </div>
        <DeleteCandidateButton candidateId={c.id} candidateName={c.full_name} />
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

/**
 * Surfaces scheduled / past interviews for the candidate. Lives high on the
 * detail page so HR sees the latest scheduling status without scrolling.
 *
 * `now` is passed down from the page-level server component so the same
 * timestamp is used for the upcoming/past partition AND for the per-row
 * "is upcoming?" badge — and so the React purity rule doesn't flag a
 * Date.now() call in render.
 */
function InterviewsSection({
  interviews,
  candidateId,
  now,
}: {
  interviews: InterviewWithJd[];
  candidateId: string;
  now: number;
}) {
  if (interviews.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-black">Interviews</h2>
          <Button asChild>
            <Link href={`/schedule/new?candidate=${candidateId}`}>Schedule interview</Link>
          </Button>
        </div>
        <p className="rounded-md border border-dashed border-soft-gray bg-white/40 px-4 py-6 text-center text-sm text-gray">
          No interviews scheduled yet.
        </p>
      </section>
    );
  }

  const upcoming = interviews.filter(
    (i) => new Date(i.starts_at).getTime() > now && i.status === "scheduled",
  );
  const past = interviews.filter(
    (i) => !upcoming.includes(i),
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-black">Interviews</h2>
        <Button asChild>
          <Link href={`/schedule?candidate=${candidateId}`}>Schedule interview</Link>
        </Button>
      </div>
      <ul className="space-y-2">
        {[...upcoming, ...past].map((i) => (
          <InterviewRow key={i.id} interview={i} now={now} />
        ))}
      </ul>
    </section>
  );
}

function InterviewRow({ interview, now }: { interview: InterviewWithJd; now: number }) {
  const start = new Date(interview.starts_at);
  const end = new Date(interview.ends_at);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const isUpcoming =
    start.getTime() > now && interview.status === "scheduled";

  const statusStyles: Record<InterviewWithJd["status"], string> = {
    scheduled: isUpcoming
      ? "bg-success/10 text-success"
      : "bg-off-white text-black",
    rescheduled: "bg-info/10 text-info",
    completed: "bg-off-white text-black",
    cancelled: "bg-warning/15 text-warning",
    no_show: "bg-danger/15 text-danger",
  };

  const stageLabels: Record<string, string> = {
    applied: "Applied / Contacted",
    screening: "Screening",
    prescreen_call: "Pre-screen call",
    first_interview: "First interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Rejected",
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-soft-gray bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            statusStyles[interview.status],
          )}
        >
          {interview.status.replace("_", " ")}
        </span>
        <span className="font-medium text-black">
          {stageLabels[interview.stage] ?? interview.stage}
        </span>
        {interview.job_descriptions?.title && (
          <span className="text-[11px] text-black">
            for {interview.job_descriptions.title}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] text-black">
          {start.toLocaleString("en-GB", {
            timeZone: "Asia/Bangkok",
            hour12: false,
            weekday: "short",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-[11px] text-gray">{durationMin} min</span>
        {interview.meet_url && (
          <a
            href={interview.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-black underline-offset-4 hover:underline"
          >
            Meet link
          </a>
        )}
        <InterviewActions
          interviewId={interview.id}
          startsAt={interview.starts_at}
          endsAt={interview.ends_at}
          candidateName="this candidate"
          isCanceled={interview.status === "cancelled"}
        />
      </div>
    </li>
  );
}

/**
 * Standalone dropdown for the original scraper input (pasted text, URL, etc.).
 * Lives at the bottom of the Source & Attachments section so all
 * "where did this candidate come from?" info clusters together.
 *
 * Hidden for kind=pdf — the PDF file itself is already listed above as an
 * attachment with View / Download links, so the dropdown would only repeat
 * the filename.
 */
function ScraperSourceDropdown({
  rawProfile,
}: {
  rawProfile: Record<string, unknown> | null;
}) {
  if (!rawProfile) return null;
  const source = rawProfile.scraper_source as ScraperSourceShape;
  if (!source) return null;
  if (source.kind === "pdf") return null;

  return (
    <details className="rounded-md border border-soft-gray bg-white/40">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-black">
        Source content ({source.kind})
      </summary>
      <div className="border-t border-soft-gray px-4 py-3 text-xs">
        {source.kind === "paste" && source.text && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-black">
            {source.text}
          </pre>
        )}
        {source.kind === "url" && source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-black underline-offset-4 hover:underline"
          >
            {source.url}
          </a>
        )}
        {source.kind === "thirdparty" && source.linkedinUrl && (
          <a
            href={source.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-black underline-offset-4 hover:underline"
          >
            {source.linkedinUrl}
          </a>
        )}
        {source.kind === "screenshot" && source.filename && (
          <p className="font-mono text-black">{source.filename}</p>
        )}
      </div>
    </details>
  );
}

function ExtractedProfileSection({
  rawProfile,
}: {
  rawProfile: Record<string, unknown> | null;
}) {
  if (!rawProfile) return null;

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

  const hasAnything =
    skills.length > 0 ||
    experience.length > 0 ||
    education.length > 0 ||
    detectedLanguage;

  if (!hasAnything) return null;

  return (
    <section className="space-y-4 rounded-lg border border-soft-gray bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-black">Extracted profile</h2>
        {detectedLanguage && (
          <span className="rounded-sm bg-off-white px-1.5 py-0.5 font-mono text-[10px] text-black">
            lang: {detectedLanguage}
          </span>
        )}
      </div>

      {skills.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-black">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="rounded-sm bg-off-white px-2 py-0.5 text-xs text-black"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {experience.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-black">
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
                  className="rounded-md border border-soft-gray bg-white/40 p-3 text-sm"
                >
                  <p className="font-medium text-black">
                    {e.title ?? "—"}
                    {e.company ? (
                      <span className="text-black"> @ {e.company}</span>
                    ) : null}
                  </p>
                  {(e.start_date || e.end_date) && (
                    <p className="mt-0.5 font-mono text-[11px] text-gray">
                      {e.start_date ?? "?"} → {e.end_date ?? "present"}
                    </p>
                  )}
                  {hasBullets && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-black marker:text-black">
                      {bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                  {fallbackSummary && (
                    <p className="mt-1 whitespace-pre-wrap text-black">
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
          <p className="mb-2 text-xs uppercase tracking-wide text-black">
            Education
          </p>
          <ul className="space-y-2">
            {education.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-soft-gray bg-white/40 p-3 text-sm"
              >
                <p className="font-medium text-black">
                  {e.institution ?? "—"}
                </p>
                {(e.degree || e.field || e.end_year) && (
                  <p className="mt-0.5 text-black">
                    {[e.degree, e.field].filter(Boolean).join(" · ")}
                    {e.end_year ? (
                      <span className="ml-1 font-mono text-[11px] text-gray">
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
      <dt className="w-20 shrink-0 text-xs text-black">{label}</dt>
      <dd className="text-sm text-black">
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
          <span className="text-gray">—</span>
        )}
      </dd>
    </div>
  );
}
