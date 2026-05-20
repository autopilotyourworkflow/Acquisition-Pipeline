import type { CacheableTextBlock } from "@/lib/anthropic/client";
import type { CandidateRow, JdRow, ScoreRow } from "@/lib/db/types";

/**
 * Cold-outreach email prompt — Phase 3e.
 *
 * Voice matters here, not cost: this is Opus 4.7 territory. Generic cold
 * emails are worse than no emails — they signal "we mass-blasted you" and
 * burn the candidate forever. The system prompt is anti-spam-shaped: it
 * forbids the clichés (`I came across your profile`, fake urgency,
 * vague flattery) and forces grounding in the candidate's specific
 * experience.
 *
 * Opus 4.7 deprecated `temperature` — the existing client.ts wrapper
 * already filters that param out for opus-4-7. Don't pass temperature
 * from the caller.
 */

export const COLD_EMAIL_PROMPT_VERSION = "cold-email.v1";

export const COLD_EMAIL_SYSTEM_PERSONA = `You are a recruiting partner for Hotel Plus (hotelplus.asia), a Thai hotel-management consulting firm. You write cold-outreach emails the way a senior recruiter writes them: short, specific, deferential, allergic to template language.

Your job: draft ONE personalized cold email from Hotel Plus to a candidate the team has identified as a strong potential fit for a specific role.

Anti-patterns — never produce any of these:
  - Generic openers ("I came across your profile…", "Hope this email finds you well…", "I wanted to reach out…")
  - Fake urgency ("limited spots", "closing soon", "moving quickly")
  - Vague flattery ("your impressive background", "your stellar experience")
  - Long preambles before the ask
  - Buzzwords ("synergy", "rockstar", "ninja", "passionate", "world-class")
  - Closing on a question that demands they sell themselves back to you ("tell me about your goals")
  - Multiple CTAs — one ask, clearly

What good looks like:
  - Subject line under 60 characters, specific to the role + a hook (a project, a company, a skill). No "Re:" or "Fwd:" prefixes — those are deceptive on a cold send.
  - Body opens with the hook from the candidate's actual experience: one specific thing they did that ties to the JD. Reference it by name (the company, the project, the technology).
  - Body explains in ONE sentence why Hotel Plus is reaching out specifically to them — what about the role makes their background relevant.
  - Body has ONE clear CTA: a low-friction next step. "Open to a 20-min chat next week?" beats "Let me know if you'd like to learn more."
  - Tone is peer-to-peer, not transactional. We respect that they probably aren't actively looking.
  - Length: under 150 words of body copy.
  - Body MUST end with the signature block exactly as provided in the user message — preserve line breaks, do not rewrite it, do not abbreviate it. If no signature block was provided, end with "Best regards" on its own line.

Output ONLY via the compose_cold_email tool. Do not respond in free text. Do not preface the tool call. Do not summarize after.

Rationale field: write ONE or TWO short sentences for the human recruiter explaining WHY this specific hook will land with this specific candidate. This is internal — they'll read it before deciding to send. Be honest; if the fit is partial, say what's strong AND what's a stretch.`;

/**
 * Build the messages for a cold-email composition run. JD body is cacheable
 * — drafting multiple emails for different candidates against the same JD
 * should hit the Anthropic prompt cache.
 */
export function buildColdEmailMessages(args: {
  jd: Pick<JdRow, "title" | "body_markdown" | "must_have" | "nice_to_have">;
  candidate: Pick<
    CandidateRow,
    | "full_name"
    | "current_title"
    | "location"
    | "linkedin_url"
    | "raw_profile"
    | "notes"
  >;
  score?: Pick<ScoreRow, "reasoning" | "strengths" | "gaps" | "weighted_total"> | null;
  fromName?: string | null;
  signature?: string | null;
}): { system: CacheableTextBlock[]; messages: { role: "user"; content: string }[] } {
  const jdBlock =
    `# Job Description: ${args.jd.title}\n\n` +
    `## Must-have\n${args.jd.must_have.map((s) => `- ${s}`).join("\n")}\n\n` +
    `## Nice-to-have\n${args.jd.nice_to_have.map((s) => `- ${s}`).join("\n")}\n\n` +
    `## Full JD\n${args.jd.body_markdown}`;

  const candidateLines: string[] = [];
  candidateLines.push(`Name: ${args.candidate.full_name}`);
  if (args.candidate.current_title) {
    candidateLines.push(`Current title: ${args.candidate.current_title}`);
  }
  if (args.candidate.location) {
    candidateLines.push(`Location: ${args.candidate.location}`);
  }
  if (args.candidate.linkedin_url) {
    candidateLines.push(`LinkedIn: ${args.candidate.linkedin_url}`);
  }
  if (args.candidate.notes) {
    candidateLines.push(`\nInternal notes:\n${args.candidate.notes}`);
  }
  if (args.candidate.raw_profile) {
    candidateLines.push(
      `\nExtracted profile (JSON):\n${JSON.stringify(args.candidate.raw_profile, null, 2)}`,
    );
  }

  const scoreBlock = args.score
    ? `\n\n## Why we think this candidate is a fit (Claude's scoring rationale)\n` +
      `Weighted total: ${args.score.weighted_total.toFixed(2)} / 10\n\n` +
      `Skills reasoning: ${args.score.reasoning?.skills ?? "—"}\n` +
      `Experience reasoning: ${args.score.reasoning?.experience ?? "—"}\n` +
      `Culture reasoning: ${args.score.reasoning?.culture ?? "—"}\n\n` +
      `Strengths: ${(args.score.strengths ?? []).join("; ") || "—"}\n` +
      `Gaps: ${(args.score.gaps ?? []).join("; ") || "—"}\n\n` +
      `Use the strongest specific item from the reasoning or strengths as the hook. If the gaps are non-trivial, acknowledge that the candidate doesn't tick every box and frame the role as a stretch worth exploring — never paper over it.`
    : "";

  const signatureBlock = args.signature?.trim()
    ? `\n\n## Signature block (use verbatim at the end of the body — preserve line breaks)\n${args.signature.trim()}`
    : "\n\n## Signature\nNo personalized signature provided. End the body with a simple 'Best regards' on its own line.";

  const fromHint = args.fromName?.trim()
    ? `\n\nThe sender's display name will be: ${args.fromName.trim()} (Hotel Plus Recruiting). Don't address from this name in the subject — Gmail handles the sender header. Use it naturally in the body's sign-off if it fits the signature block above.`
    : "";

  const userContent =
    `Draft ONE cold-outreach email for this candidate against the JD above.\n\n` +
    `# Candidate\n${candidateLines.join("\n")}` +
    scoreBlock +
    signatureBlock +
    fromHint +
    `\n\nReturn via the compose_cold_email tool only.`;

  return {
    system: [
      { type: "text", text: COLD_EMAIL_SYSTEM_PERSONA },
      // Cacheable: same JD across many candidate drafts.
      { type: "text", cache: true, text: jdBlock },
    ],
    messages: [{ role: "user", content: userContent }],
  };
}
