import type { ProviderResult } from "@/lib/sourcing/types";

/**
 * Stub — SEEK sourcing requires a partner integration we don't have. See
 * `indeed.ts` for the same rationale.
 */
export async function runSeekSourcing(): Promise<ProviderResult> {
  return {
    platform: "seek",
    candidates: [],
    cost_usd: 0,
    note: "not_implemented",
  };
}
