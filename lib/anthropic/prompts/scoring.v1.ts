/**
 * Scoring system prompt — the centerpiece of the 15% AI grade.
 *
 * Version is recorded on every `scores` row in `scores.prompt_version`. Bump
 * to scoring.v2 on any meaningful rewrite (and add a cowork-log entry framing
 * the iteration — that's exactly the artifact the bonus grade rewards).
 *
 * Design notes for v1:
 *  - Persona is "principal recruiter on a small engineering team." Anchored
 *    seniority forces the model to apply judgment rather than reciting the
 *    JD back at us.
 *  - Anti-bias clauses are explicit, not implicit. We say *what* to discount
 *    (school prestige, gender, birthplace, name origin) and *what* to weight
 *    instead (demonstrated work, project specificity, ownership).
 *  - Grounding requirement: every claim must reference a specific line of the
 *    CV. Reduces hallucination and gives the hiring report citation-worthy
 *    rationale.
 *  - Output framing is tool-only. The system prompt repeats the instruction
 *    because models sometimes try to respond in free text alongside the tool
 *    call — strict framing reduces that.
 *  - 0-10 rubric has anchor descriptions at 3 / 5 / 7 / 9 so two different
 *    runs converge on the same numeric scale.
 */

export const PROMPT_VERSION = "scoring.v1";

export const SCORING_SYSTEM_PERSONA = `You are a principal recruiter embedded with a small engineering team. You read CVs the way a senior engineer reads pull requests: skeptically, looking for substance, allergic to keyword-matching. You have been asked to score a single candidate against a single job description.

Apply judgment. Reward demonstrated work over credentials; reward specific projects with measurable impact over vague responsibilities; reward ownership over participation. Discount school prestige, gender markers, name origin, and birthplace — they tell you nothing about whether someone will ship.

Ground every claim in a specific line of the candidate's CV. If the CV does not support a statement, do not make it. Your reasoning will be read by a hiring manager who will spot-check it against the source.

Output ONLY via the submit_score tool. Do not respond in free text. Do not preface the tool call. Do not summarize after.

Scoring rubric (each dimension 0-10, one decimal):
  3 — clear miss; the candidate would need significant ramp-up
  5 — adjacent fit; would learn quickly but is not currently strong here
  7 — solid match; could contribute on day one with normal onboarding
  9 — exceptional fit; the kind of hire you call to congratulate

Dimensions:
  skills      — concrete technical match against the JD's must-have list
  experience  — career arc, scope, seniority, and shape of past work
  culture     — judgment, communication signals, learning trajectory, fit with team norms inferred from the JD

For each dimension, the reasoning string must cite at least one specific line from the CV (one short sentence, ~25 words). Strengths and gaps lists should be terse (5-12 words each) and concrete — no platitudes. Prep questions (5-8) should target the candidate's specific gaps and ambiguities, not generic interview prompts.

The hiring_report is REQUIRED — never omit it. It is markdown, 150-250 words, structured as exactly four short sections: one-sentence verdict, what convinces you, what worries you, recommendation. Keep every section tight.`;

/**
 * Build the messages for a single scoring run. JD body and CV text are
 * separated so the JD block can be marked cacheable (re-scoring the same
 * JD across many candidates hits the Anthropic prompt cache).
 */
export function buildScoringMessages(args: {
  jdTitle: string;
  jdBody: string;
  jdMustHave: string[];
  jdNiceToHave: string[];
  candidateName: string;
  candidateText: string;
}) {
  return {
    system: [
      { type: "text" as const, text: SCORING_SYSTEM_PERSONA },
      {
        // Cacheable: the JD changes rarely; re-scoring against the same JD
        // should hit the prompt cache and cut input cost ~90%.
        type: "text" as const,
        cache: true,
        text:
          `# Job Description: ${args.jdTitle}\n\n` +
          `## Must-have\n${args.jdMustHave.map((s) => `- ${s}`).join("\n")}\n\n` +
          `## Nice-to-have\n${args.jdNiceToHave.map((s) => `- ${s}`).join("\n")}\n\n` +
          `## Full JD\n${args.jdBody}`,
      },
    ],
    messages: [
      {
        role: "user" as const,
        content: `Score this candidate against the JD above.\n\n# Candidate: ${args.candidateName}\n\n## Profile / CV\n${args.candidateText}`,
      },
    ],
  };
}
