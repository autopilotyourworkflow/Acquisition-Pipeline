import { z } from "zod";
import type { ToolDefinition } from "@/lib/anthropic/client";

/**
 * Tool the Opus call returns when deriving a sourcing query from a JD. The
 * orchestrator hands these keywords/titles to each provider (Proxycurl
 * Person Search, SerpAPI for JobsDB) to fan out candidate discovery.
 */
export const DeriveSourcingQuerySchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(10),
  titles: z.array(z.string().min(1)).max(5).default([]),
  location: z.string().nullable().optional(),
  seniority: z
    .enum(["entry", "mid", "senior", "principal", "executive"])
    .nullable()
    .optional(),
});

export type DeriveSourcingQueryInput = z.infer<typeof DeriveSourcingQuerySchema>;

export const deriveSourcingQueryTool: ToolDefinition<DeriveSourcingQueryInput> = {
  name: "derive_sourcing_query",
  description:
    "Distill the JD into the smallest set of search terms that would surface " +
    "qualified candidates on LinkedIn or job-board profile pages. " +
    "`keywords` are skills / tools / domain terms (e.g. ['TypeScript', 'Next.js', 'hospitality SaaS']). " +
    "`titles` are alternative job titles a strong fit might hold today " +
    "(e.g. ['Full Stack Engineer', 'Software Engineer']). " +
    "Use the JD's location only if it's a hard requirement; leave null otherwise. " +
    "Pick the closest seniority bracket from the enum or leave null if the JD doesn't say.",
  input_schema: z.toJSONSchema(DeriveSourcingQuerySchema) as Record<string, unknown>,
  validate: (raw) => DeriveSourcingQuerySchema.parse(raw),
};
