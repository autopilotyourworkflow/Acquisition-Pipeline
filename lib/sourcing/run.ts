/**
 * Outbound-sourcing orchestrator. The async generator yields SSE-friendly
 * events; `app/api/source/run/route.ts` pipes them to the client.
 *
 * High-level flow:
 *   1. Insert a `sourcing_runs` row (status='running').
 *   2. Opus → derive_sourcing_query tool — emit `query_derived`.
 *   3. Decrypt per-user API keys from `user_settings`.
 *   4. Split N across enabled providers; fan out.
 *   5. For each provider result, withAudit-insert as a `outbound_sourced`
 *      candidate and emit `candidate_found`.
 *   6. Score each new candidate via `scoreCandidateSingle` — emit
 *      `candidate_scored`.
 *   7. Patch the `sourcing_runs` row with final counts + status.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { decryptUserSecret } from "@/lib/crypto/secret-key";
import { ORG_ID } from "@/lib/db/constants";
import type { JdRow } from "@/lib/db/types";
import { deriveSearchQuery } from "@/lib/sourcing/query";
import { runLinkedInSourcing } from "@/lib/sourcing/providers/linkedin";
import { runJobsDbSourcing } from "@/lib/sourcing/providers/jobsdb";
import { runIndeedSourcing } from "@/lib/sourcing/providers/indeed";
import { runSeekSourcing } from "@/lib/sourcing/providers/seek";
import { scoreCandidateSingle } from "@/lib/scoring/score-one";
import type {
  SourcingEvent,
  SourcingRequest,
  ProviderCandidate,
  ProviderResult,
  SourcingPlatform,
} from "@/lib/sourcing/types";

export async function* runSourcing(
  req: SourcingRequest,
): AsyncGenerator<SourcingEvent> {
  const admin = createAdminClient();

  // 1. Create the run row up front so the JD page's "Last 5 runs" panel
  // sees it even mid-flight.
  const { data: runRow, error: runErr } = await admin
    .from("sourcing_runs")
    .insert({
      org_id: ORG_ID,
      jd_id: req.jdId,
      user_id: req.userId,
      platforms: req.platforms,
      n_requested: req.n,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    yield { type: "error", message: `Couldn't start run: ${runErr?.message ?? "unknown"}` };
    yield { type: "done", n_found: 0, cost_usd: 0, status: "failed" };
    return;
  }
  const runId = runRow.id as string;
  yield { type: "run_started", runId };

  let totalCost = 0;
  let totalFound = 0;

  try {
    // 2. Fetch the JD + derive the query
    const { data: jd, error: jErr } = await admin
      .from("job_descriptions")
      .select("*")
      .eq("id", req.jdId)
      .single();
    if (jErr || !jd) throw new Error(`JD not found: ${req.jdId}`);
    const jdRow = jd as JdRow;

    const { query, cost_usd: queryCost } = await deriveSearchQuery(jdRow);
    totalCost += queryCost;
    yield { type: "query_derived", query, cost_usd: queryCost };

    // Patch run with derived query so /jds page can show it later
    await admin
      .from("sourcing_runs")
      .update({ derived_query: query })
      .eq("id", runId);

    // 3. Decrypt per-user keys (only what's needed)
    const { data: settings } = await admin
      .from("user_settings")
      .select("proxycurl_api_key_encrypted, serpapi_key_encrypted")
      .eq("user_id", req.userId)
      .maybeSingle();

    const proxycurlKey = decryptIfPresent(settings?.proxycurl_api_key_encrypted);
    const serpapiKey = decryptIfPresent(settings?.serpapi_key_encrypted);

    // 4. Split N across enabled platforms (LinkedIn + JobsDB participate;
    // the stubs return [] but we still emit provider_started/done for
    // them so the UI can render every selected platform.)
    const splits = splitAcrossPlatforms(req.platforms, req.n);

    for (const platform of req.platforms) {
      const nTarget = splits[platform] ?? 0;
      if (nTarget === 0) continue;
      yield { type: "provider_started", platform, n_target: nTarget };

      let result: ProviderResult;
      try {
        result = await runProvider(platform, {
          nTarget,
          query,
          proxycurlKey,
          serpapiKey,
        });
      } catch (err) {
        result = {
          platform,
          candidates: [],
          cost_usd: 0,
          error: err instanceof Error ? err.message : "Unknown provider error",
        };
      }
      totalCost += result.cost_usd;

      // 5. Insert each candidate (audit-wrapped) and emit found.
      for (const pc of result.candidates) {
        try {
          const inserted = await insertOutboundCandidate({
            pc,
            jdId: req.jdId,
            userId: req.userId,
            runId,
          });
          yield {
            type: "candidate_found",
            platform: pc.platform,
            candidate: pc.candidate,
            source_url: pc.source_url,
            candidateId: inserted.id,
          };
          totalFound += 1;

          // 6. Score the candidate (best-effort — a failed score shouldn't
          // tank the run).
          try {
            const score = await scoreCandidateSingle({
              candidateId: inserted.id,
              jdId: req.jdId,
              userId: req.userId,
              model: "claude-haiku-4-5",
            });
            totalCost += score.cost_usd;
            yield {
              type: "candidate_scored",
              candidateId: inserted.id,
              weighted_total: score.weighted_total,
            };
          } catch (err) {
            yield {
              type: "error",
              message: `Score failed for ${pc.candidate.full_name}: ${
                err instanceof Error ? err.message : "unknown"
              }`,
            };
          }
        } catch (err) {
          yield {
            type: "error",
            message: `Insert failed for ${pc.candidate.full_name}: ${
              err instanceof Error ? err.message : "unknown"
            }`,
          };
        }
      }

      yield {
        type: "provider_done",
        platform,
        n_found: result.candidates.length,
        cost_usd: result.cost_usd,
        note: result.note ?? result.error,
      };
    }

    // 7. Finalize
    await admin
      .from("sourcing_runs")
      .update({
        status: "done",
        n_found: totalFound,
        cost_usd: Number(totalCost.toFixed(4)),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    yield {
      type: "done",
      n_found: totalFound,
      cost_usd: Number(totalCost.toFixed(4)),
      status: "done",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await admin
      .from("sourcing_runs")
      .update({
        status: "failed",
        n_found: totalFound,
        cost_usd: Number(totalCost.toFixed(4)),
        finished_at: new Date().toISOString(),
        error: msg,
      })
      .eq("id", runId);
    yield { type: "error", message: msg };
    yield {
      type: "done",
      n_found: totalFound,
      cost_usd: Number(totalCost.toFixed(4)),
      status: "failed",
    };
  }
}

function decryptIfPresent(raw: unknown): string | null {
  if (!raw) return null;
  try {
    return decryptUserSecret(raw as Buffer | Uint8Array | string);
  } catch {
    return null;
  }
}

/**
 * Allocate N across the enabled platforms. Stubs (indeed/seek) are excluded
 * from the live count — they'd just consume slots returning nothing. If
 * those are the only platforms, return zeros so the UI shows "0 found"
 * cleanly instead of dividing by zero.
 */
function splitAcrossPlatforms(
  platforms: SourcingPlatform[],
  n: number,
): Record<SourcingPlatform, number> {
  const result: Record<SourcingPlatform, number> = {
    linkedin: 0,
    jobsdb: 0,
    indeed: 0,
    seek: 0,
  };
  const live = platforms.filter((p) => p === "linkedin" || p === "jobsdb");
  if (live.length === 0) return result;
  const base = Math.floor(n / live.length);
  let remainder = n - base * live.length;
  for (const p of live) {
    result[p] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return result;
}

async function runProvider(
  platform: SourcingPlatform,
  ctx: {
    nTarget: number;
    query: Awaited<ReturnType<typeof deriveSearchQuery>>["query"];
    proxycurlKey: string | null;
    serpapiKey: string | null;
  },
): Promise<ProviderResult> {
  switch (platform) {
    case "linkedin":
      return runLinkedInSourcing({
        query: ctx.query,
        nTarget: ctx.nTarget,
        proxycurlKey: ctx.proxycurlKey ?? "",
      });
    case "jobsdb":
      return runJobsDbSourcing({
        query: ctx.query,
        nTarget: ctx.nTarget,
        serpapiKey: ctx.serpapiKey,
      });
    case "indeed":
      return runIndeedSourcing();
    case "seek":
      return runSeekSourcing();
  }
}

async function insertOutboundCandidate(args: {
  pc: ProviderCandidate;
  jdId: string;
  userId: string;
  runId: string;
}): Promise<{ id: string }> {
  const admin = createAdminClient();
  const c = args.pc.candidate;

  const insertPayload = {
    org_id: ORG_ID,
    full_name: c.full_name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    current_title: c.current_title ?? null,
    location: c.location ?? null,
    linkedin_url: c.linkedin_url ?? null,
    source: "outbound_sourced" as const,
    source_url: args.pc.source_url ?? c.source_url ?? null,
    jd_id: args.jdId,
    raw_profile: {
      ...c,
      sourcing_provider: args.pc.platform,
      sourcing_run_id: args.runId,
    },
    stage: "applied" as const,
    created_by: args.userId,
  };

  const { data: inserted, error: insErr } = await admin
    .from("candidates")
    .insert(insertPayload)
    .select()
    .single();
  if (insErr || !inserted) {
    throw new Error(insErr?.message ?? "Insert failed");
  }

  const rowHash = computeRowHash(inserted as Record<string, unknown>);
  await admin
    .from("candidates")
    .update({ row_hash: rowHash })
    .eq("id", inserted.id);

  const finalRow = { ...(inserted as Record<string, unknown>), row_hash: rowHash };
  await withAudit({
    actorId: args.userId,
    orgId: ORG_ID,
    action: "insert",
    table: "candidates",
    targetId: inserted.id as string,
    before: null,
    mutate: async () => finalRow,
  });

  return { id: inserted.id as string };
}
