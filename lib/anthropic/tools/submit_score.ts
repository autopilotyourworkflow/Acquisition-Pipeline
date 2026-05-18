import { z } from "zod";
import type { ToolDefinition } from "@/lib/anthropic/client";

/**
 * The scoring output schema. Three sub-scores (0-10, one decimal), per-dimension
 * reasoning, structured strengths/gaps, 5-8 prep questions, and a markdown
 * hiring report. The weighted total is computed in Postgres as a GENERATED
 * column from the three sub-scores, so we don't ask the model for it.
 */
// Score is a number in [0, 10]. We round to one decimal after parsing — the
// rounding lives outside the zod schema because zod transforms can't be
// represented in JSON Schema for the tool definition.
const scoreNumber = z.number().min(0).max(10);

export const SubmitScoreSchema = z.object({
  skills_score: scoreNumber,
  experience_score: scoreNumber,
  culture_score: scoreNumber,
  reasoning: z.object({
    skills: z.string().min(1),
    experience: z.string().min(1),
    culture: z.string().min(1),
  }),
  strengths: z.array(z.string().min(1)).min(1),
  gaps: z.array(z.string().min(1)).min(1),
  prep_questions: z.array(z.string().min(1)).min(5).max(8),
  hiring_report: z.string().min(1),
});

export type SubmitScoreInput = z.infer<typeof SubmitScoreSchema>;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const submitScoreTool: ToolDefinition<SubmitScoreInput> = {
  name: "submit_score",
  description:
    "Submit the candidate's screening score against the job description. " +
    "Use this tool to return a structured assessment — do NOT respond in free text. " +
    "Each sub-score is on a 0-10 scale with one decimal place. " +
    "Reasoning must ground every claim in a specific line of the CV. " +
    "Provide 5-8 interview prep questions tailored to the candidate's gaps. " +
    "Hiring report is markdown, ≤500 words, structured as a recommendation.",
  input_schema: z.toJSONSchema(SubmitScoreSchema) as Record<string, unknown>,
  validate: (raw) => {
    const parsed = SubmitScoreSchema.parse(raw);
    return {
      ...parsed,
      skills_score: round1(parsed.skills_score),
      experience_score: round1(parsed.experience_score),
      culture_score: round1(parsed.culture_score),
    };
  },
};
