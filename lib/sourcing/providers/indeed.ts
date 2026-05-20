import type { ProviderResult } from "@/lib/sourcing/types";

/**
 * Stub — Indeed sourcing requires an employer-account scrape or partner API
 * integration we don't have. The UI checkbox is disabled with a "Coming soon"
 * tooltip but the provider is wired here so the fan-out treats it as a
 * no-op rather than throwing.
 */
export async function runIndeedSourcing(): Promise<ProviderResult> {
  return {
    platform: "indeed",
    candidates: [],
    cost_usd: 0,
    note: "not_implemented",
  };
}
