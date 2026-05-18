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
        summary: z.string().nullable(),
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

export const extractCandidateTool: ToolDefinition<ExtractCandidateInput> = {
  name: "extract_candidate",
  description:
    "Extract a structured candidate record from raw profile text or imagery. " +
    "Use this tool to return the normalized fields — do NOT respond in free text. " +
    "Set fields to null when the source does not contain that information; " +
    "do NOT invent values. Detect the candidate's primary written language.",
  input_schema: z.toJSONSchema(ExtractCandidateSchema) as Record<string, unknown>,
  validate: (raw) => ExtractCandidateSchema.parse(raw),
};
