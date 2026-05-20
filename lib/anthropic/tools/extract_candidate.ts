import { z } from "zod";
import type { ToolDefinition } from "@/lib/anthropic/client";

/**
 * Schema for the candidate extraction tool — used by Day 3's scraper to
 * normalize URL / paste / PDF / screenshot / third-party inputs through a
 * single shape. Scaffolded here on Day 2 so the contract is stable when
 * the scraper modules land.
 */
export const ExtractCandidateSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  current_title: z.string().nullable(),
  location: z.string().nullable(),
  linkedin_url: z.string().url().nullable(),
  source_url: z.string().url().nullable(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        start_date: z.string().nullable(),
        end_date: z.string().nullable(),
        // Optional 1-sentence framing of the role. Bullets carry the
        // detailed accomplishments — see `bullets`.
        summary: z.string().nullable(),
        // Distinct accomplishments / responsibilities, one per item. This
        // is what gets rendered as a bullet list on the candidate detail
        // page, so the model should NEVER concatenate them into prose.
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().nullable(),
        field: z.string().nullable(),
        end_year: z.number().nullable(),
      }),
    )
    .default([]),
  detected_language: z.enum(["en", "th", "other"]).default("en"),
});

export type ExtractCandidateInput = z.infer<typeof ExtractCandidateSchema>;

/**
 * Defensive coercions for shape mismatches we've seen in the wild before
 * passing to zod. The JSON schema sent to Claude still requests arrays for
 * the collection fields, but Haiku occasionally emits the wrong shape
 * (comma-separated string, a free-text summary, null) — rather than fail
 * the whole extraction over that, normalize here so the candidate still
 * gets saved with whatever scalar fields the model did capture.
 */
function coerceRawInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  // skills must be string[] — accept comma/semicolon/newline-separated string
  if (typeof obj.skills === "string") {
    obj.skills = (obj.skills as string)
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (!Array.isArray(obj.skills)) {
    obj.skills = [];
  }

  // experience / education are array-of-objects. We can't reconstruct
  // structure from a flat string, so degrade to [] rather than failing
  // the whole extraction over the wrong wrapper type. Bullets / role
  // details may be lost, but name / email / title still land.
  if (!Array.isArray(obj.experience)) obj.experience = [];
  if (!Array.isArray(obj.education)) obj.education = [];

  return obj;
}

export const extractCandidateTool: ToolDefinition<ExtractCandidateInput> = {
  name: "extract_candidate",
  description:
    "Extract a structured candidate record from raw profile text or imagery. " +
    "Use this tool to return the normalized fields — do NOT respond in free text. " +
    "Set fields to null when the source does not contain that information; " +
    "do NOT invent values. Skills MUST be a JSON array of strings, never a " +
    "comma-separated string. For each experience entry, `bullets` MUST be " +
    "an array where each element is ONE distinct accomplishment or " +
    "responsibility — never concatenate multiple bullets into a single " +
    "paragraph. Use `summary` for a one-sentence framing of the role only. " +
    "Detect the candidate's primary written language.",
  input_schema: z.toJSONSchema(ExtractCandidateSchema) as Record<string, unknown>,
  validate: (raw) => ExtractCandidateSchema.parse(coerceRawInput(raw)),
};
