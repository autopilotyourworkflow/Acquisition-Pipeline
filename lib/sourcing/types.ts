import type { ExtractCandidateInput } from "@/lib/anthropic/tools/extract_candidate";
import type { DeriveSourcingQueryInput } from "@/lib/anthropic/tools/derive_sourcing_query";

export type SourcingPlatform = "linkedin" | "jobsdb" | "indeed" | "seek";

export const SOURCING_PLATFORMS: SourcingPlatform[] = [
  "linkedin",
  "jobsdb",
  "indeed",
  "seek",
];

export const SOURCING_PLATFORM_LABELS: Record<SourcingPlatform, string> = {
  linkedin: "LinkedIn",
  jobsdb: "JobsDB",
  indeed: "Indeed",
  seek: "SEEK",
};

/**
 * Per-candidate result from a single provider. `candidate` is the
 * extract_candidate-shaped object that gets handed to createCandidate.
 * `cost_usd` and `note` are surfaced into the SSE stream for cost transparency
 * and graceful empty/failed runs.
 */
export type ProviderCandidate = {
  platform: SourcingPlatform;
  candidate: ExtractCandidateInput;
  source_url: string | null;
  cost_usd: number;
  /** e.g. "proxycurl_profile", "serpapi+jina", "jina_only", "not_implemented" */
  note: string;
};

export type ProviderResult = {
  platform: SourcingPlatform;
  candidates: ProviderCandidate[];
  cost_usd: number;
  /** Top-level note for the platform (e.g. "no_serpapi_key", "not_implemented") */
  note?: string;
  error?: string;
};

export type SourcingMode = "Short" | "Full" | "Full + email search";

export type SourcingRequest = {
  jdId: string;
  userId: string;
  platforms: SourcingPlatform[];
  n: number;
  /** LinkedIn scraper mode for the Apify call. Defaults to Short (cheapest). */
  mode?: SourcingMode;
};

/** SSE event union the orchestrator emits. */
export type SourcingEvent =
  | { type: "run_started"; runId: string }
  | { type: "query_derived"; query: DeriveSourcingQueryInput; cost_usd: number }
  | {
      type: "provider_started";
      platform: SourcingPlatform;
      n_target: number;
    }
  | {
      type: "candidate_found";
      platform: SourcingPlatform;
      candidate: ExtractCandidateInput;
      source_url: string | null;
      candidateId: string;
    }
  | {
      type: "candidate_scored";
      candidateId: string;
      weighted_total: number | null;
    }
  | {
      type: "provider_done";
      platform: SourcingPlatform;
      n_found: number;
      cost_usd: number;
      note?: string;
    }
  | { type: "error"; message: string }
  | {
      type: "done";
      n_found: number;
      cost_usd: number;
      status: "done" | "failed";
    };
