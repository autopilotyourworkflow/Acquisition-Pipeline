import { z } from "zod";
import type { ToolDefinition } from "@/lib/anthropic/client";

/**
 * Schema for the cold-email composition tool — used by Phase 3e's
 * "Draft cold email" CTA on the candidate detail page.
 *
 * Body is markdown so it renders cleanly in the dialog textarea (plain
 * text on disk; the Gmail send path runs a tiny markdown→HTML pass for
 * the HTML part of the MIME multipart body).
 *
 * Rationale is the "why this hook should land" line shown to HR below
 * the editable subject + body. It's a confidence-building artifact: a
 * recruiter can decide quickly whether to send-as-is, edit, or trash.
 */
export const ComposeColdEmailSchema = z.object({
  subject: z.string().min(5).max(200),
  body_markdown: z.string().min(80).max(2000),
  rationale: z.string().min(20).max(500),
});

export type ComposeColdEmailInput = z.infer<typeof ComposeColdEmailSchema>;

export const composeColdEmailTool: ToolDefinition<ComposeColdEmailInput> = {
  name: "compose_cold_email",
  description:
    "Draft a personalized cold-outreach email for this candidate. Use this tool " +
    "to return the final draft — do NOT respond in free text, do not preface, do " +
    "not summarize after. Subject line: short and specific (no clickbait, no " +
    "fake urgency). Body: at least one concrete hook tied to a specific item " +
    "from the candidate's profile (a project, a role, a skill, a result) — " +
    "generic openers like 'I came across your profile' are forbidden. The body " +
    "MUST end with the signature block exactly as provided in the user message " +
    "(if any was provided). Rationale: one or two sentences for the recruiter " +
    "explaining WHY this specific hook should land with this specific candidate.",
  input_schema: z.toJSONSchema(ComposeColdEmailSchema) as Record<string, unknown>,
  validate: (raw) => ComposeColdEmailSchema.parse(raw),
};
