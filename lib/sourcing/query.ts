import { callWithTool, type CacheableTextBlock } from "@/lib/anthropic/client";
import {
  deriveSourcingQueryTool,
  type DeriveSourcingQueryInput,
} from "@/lib/anthropic/tools/derive_sourcing_query";
import type { JdRow } from "@/lib/db/types";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Opus pass that converts a JD into a sourcing query. Kept terse — the
 * fan-out providers want a tight list of skills + titles, not the full JD
 * body — and run at temperature 0 so re-running gives the same query.
 */
export async function deriveSearchQuery(jd: JdRow): Promise<{
  query: DeriveSourcingQueryInput;
  cost_usd: number;
}> {
  const system: CacheableTextBlock[] = [
    {
      type: "text",
      text: `You are a recruiter assistant. Your job is to distill a job description
into the smallest, most useful set of search terms that would help find
qualified candidates on LinkedIn or job-board profile pages.

Guidelines:
- Prefer concrete, searchable terms (specific frameworks, languages, domains)
  over vague qualifiers ("strong communicator", "team player").
- Titles should be plausible current titles a fit would hold today, not the
  hiring title — e.g. for a "Senior Full Stack Developer" role the titles
  might include "Software Engineer", "Web Developer", "Full Stack Engineer".
- Only include a location if the JD says the role is location-bound. If the
  JD says "remote" or doesn't mention location, leave it null.
- Map the JD's stated experience requirements to the closest seniority
  bracket. If the JD doesn't say, leave it null.
- Respond ONLY via the derive_sourcing_query tool. Do not write free text.`,
    },
  ];

  const userText = [
    `Job title: ${jd.title}`,
    jd.department ? `Department: ${jd.department}` : null,
    jd.location ? `Location: ${jd.location}` : null,
    jd.must_have.length > 0
      ? `Must-have skills: ${jd.must_have.join(", ")}`
      : null,
    jd.nice_to_have.length > 0
      ? `Nice-to-have skills: ${jd.nice_to_have.join(", ")}`
      : null,
    "",
    "Full JD:",
    jd.body_markdown,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: MessageParam[] = [{ role: "user", content: userText }];

  const result = await callWithTool({
    model: "claude-opus-4-7",
    system,
    messages,
    tool: deriveSourcingQueryTool,
    temperature: 0,
    maxTokens: 1024,
  });

  return {
    query: result.value,
    cost_usd: result.telemetry.cost_usd,
  };
}
