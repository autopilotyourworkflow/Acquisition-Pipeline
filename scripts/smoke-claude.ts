/**
 * Smoke test: score a synthetic candidate against the seed JD via the real
 * Claude client. Verifies the whole foundation stack: client.ts retry/cache,
 * tool-use forcing, telemetry, and scoring.v1 prompt.
 *
 * Run: node --env-file=.env.local --import tsx scripts/smoke-claude.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { callWithTool } from "@/lib/anthropic/client";
import { submitScoreTool } from "@/lib/anthropic/tools/submit_score";
import { PROMPT_VERSION, buildScoringMessages } from "@/lib/anthropic/prompts/scoring.v1";

const FAKE_CV = `
Somchai Tantipong — Full Stack Developer
Bangkok, Thailand · somchai@example.com · linkedin.com/in/somchai

EXPERIENCE
Senior Software Engineer, Grab — Bangkok, 2022–present
  - Led migration of payments microservice from Ruby to TypeScript (Node.js + Fastify).
  - Built React + TanStack Query dashboard used by 80 merchant-success operators.
  - Owned Postgres schema design for new dispute-resolution flow; cut average
    case-handle time 35% by adding pre-computed status materialization.

Full Stack Developer, Wongnai — Bangkok, 2019–2022
  - Shipped Wongnai for Business dashboard (Next.js + Apollo + MySQL).
  - Integrated Google Calendar API for restaurant-event scheduling.
  - Built internal LLM tool (OpenAI) for triaging customer-support tickets;
    reduced first-response time 40% in pilot.

EDUCATION
Chulalongkorn University, B.Eng Computer Engineering, 2019

SKILLS
TypeScript · React · Next.js · Node.js · Postgres · GraphQL · Docker ·
LLM integration · Google Cloud
`;

async function main() {
  const admin = createAdminClient();

  const { data: jd, error } = await admin
    .from("job_descriptions")
    .select("*")
    .eq("title", "Full Stack Developer")
    .single();
  if (error || !jd) throw new Error(`Seed JD not found: ${error?.message}`);

  console.log(`Scoring synthetic CV against JD "${jd.title}"`);
  console.log(`Model: claude-opus-4-7 · prompt: ${PROMPT_VERSION}`);
  console.log("---");

  const { system, messages } = buildScoringMessages({
    jdTitle: jd.title,
    jdBody: jd.body_markdown,
    jdMustHave: jd.must_have,
    jdNiceToHave: jd.nice_to_have,
    candidateName: "Somchai Tantipong",
    candidateText: FAKE_CV,
  });

  const started = Date.now();
  const { value, telemetry } = await callWithTool({
    model: "claude-haiku-4-5",
    system,
    messages,
    tool: submitScoreTool,
    maxTokens: 8192,
    temperature: 0,
  });

  console.log(`\n✅ Score returned in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`   Skills:     ${value.skills_score} / 10`);
  console.log(`   Experience: ${value.experience_score} / 10`);
  console.log(`   Culture:    ${value.culture_score} / 10`);
  console.log(
    `   Weighted:   ${(
      value.skills_score * 0.4 +
      value.experience_score * 0.4 +
      value.culture_score * 0.2
    ).toFixed(2)} / 10  (threshold ${jd.threshold})`,
  );
  console.log(`\nStrengths: ${value.strengths.join(" · ")}`);
  console.log(`Gaps: ${value.gaps.join(" · ")}`);
  console.log(`\nFirst prep question: ${value.prep_questions[0]}`);
  console.log(`\nTelemetry:`);
  console.log(`   input_tokens:  ${telemetry.input_tokens}`);
  console.log(`   output_tokens: ${telemetry.output_tokens}`);
  console.log(`   cache_write:   ${telemetry.cache_creation_input_tokens}`);
  console.log(`   cache_read:    ${telemetry.cache_read_input_tokens}`);
  console.log(`   cost:          $${telemetry.cost_usd.toFixed(4)}`);
  console.log(`   retries:       ${telemetry.retries}`);
  console.log(`   duration:      ${telemetry.duration_ms}ms`);
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
