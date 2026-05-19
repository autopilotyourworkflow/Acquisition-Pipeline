/**
 * Single normalize path for all scraper endpoints. Calls Claude with the
 * extract_candidate tool to convert raw input (URL HTML, paste text, screenshot,
 * third-party API output) into structured candidate JSON. Uses Haiku by default.
 */

import { callWithTool, type CacheableTextBlock } from "@/lib/anthropic/client";
import { extractCandidateTool, type ExtractCandidateInput } from "@/lib/anthropic/tools/extract_candidate";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export type NormalizeInput = {
  text: string;
  model?: "haiku" | "opus";
};

export async function normalizeCandidate(input: NormalizeInput): Promise<ExtractCandidateInput> {
  const modelId = input.model === "opus" ? "claude-opus-4-7" : "claude-haiku-4-5";

  const system: CacheableTextBlock[] = [
    {
      type: "text",
      text: `You are a resume and candidate profile parser. Your job is to extract structured
candidate information from unstructured text, HTML, or API output.

Guidelines:
- Extract only facts that are explicitly stated in the text
- Do not invent or infer information not present in the source
- For URLs, validate that they are proper URLs before including them
- For skills, extract them as a list of specific, distinct skills (JSON array
  of strings — NEVER a comma-separated string)
- For experience, capture company, title, dates. For each role, populate
  \`bullets\` with the SPECIFIC accomplishments and responsibilities, ONE
  PER ARRAY ELEMENT. Do not join them with periods or commas into a single
  paragraph. The frontend renders these as a bullet list, so the array
  structure is load-bearing. \`summary\` is optional and should be at most
  one sentence of framing — leave it null if you'd just be restating the
  bullets.
- For education, capture institution, degree, field of study, and graduation year
- Dates should be preserved as-is from the source (they'll be parsed on insert)
- Detect the primary language of the profile text and set detected_language`,
    },
  ];

  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Extract candidate information from the following text. Be precise: extract only information
that is explicitly stated. If a field is not present, set it to null (do not guess or invent).

Detect the candidate's primary language and set detected_language accordingly.

${input.text}`,
    },
  ];

  const result = await callWithTool({
    model: modelId,
    system,
    messages,
    tool: extractCandidateTool,
  });

  return result.value;
}
