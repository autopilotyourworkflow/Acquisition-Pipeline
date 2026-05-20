/**
 * LinkedIn provider — Proxycurl Person Search + Person Profile.
 *
 * Two API calls per run:
 *   1. /proxycurl/api/v2/search/person  → list of profile URLs
 *   2. /proxycurl/api/v2/linkedin       → per profile, full details
 *
 * The Person Profile call is the same one /api/scrape/thirdparty uses for the
 * single-candidate scraper. We re-format its output as text and hand it to
 * `normalizeCandidate` (Haiku) for a single normalize path.
 */

import { normalizeCandidate } from "@/lib/scrape/normalize";
import type {
  ProviderCandidate,
  ProviderResult,
  SourcingPlatform,
} from "@/lib/sourcing/types";
import type { DeriveSourcingQueryInput } from "@/lib/anthropic/tools/derive_sourcing_query";

const PLATFORM: SourcingPlatform = "linkedin";

// Approximate per-call cost from Proxycurl pricing — recorded for the run's
// cost_usd column. Tune later if the rate card shifts.
const SEARCH_COST_USD = 0.01;
const PROFILE_COST_USD = 0.10;

type LinkedInRunInput = {
  query: DeriveSourcingQueryInput;
  nTarget: number;
  proxycurlKey: string;
};

type ProxycurlPersonSearchResult = {
  results?: Array<{
    linkedin_profile_url?: string;
    last_updated?: string;
  }>;
  next_page?: string | null;
};

export async function runLinkedInSourcing(input: LinkedInRunInput): Promise<ProviderResult> {
  if (!input.proxycurlKey) {
    return {
      platform: PLATFORM,
      candidates: [],
      cost_usd: 0,
      note: "no_proxycurl_key",
    };
  }

  // Build the search query. Proxycurl's /search/person endpoint supports
  // typed filters; we pick keyword + current_role_title + location.
  const params = new URLSearchParams();
  params.set("page_size", String(Math.min(Math.max(input.nTarget, 1), 100)));
  // Use keywords joined as the free-text search term.
  if (input.query.keywords.length > 0) {
    params.set("summary", input.query.keywords.join(" OR "));
  }
  if (input.query.titles.length > 0) {
    // current_role_title supports a regex string. OR-join the titles.
    params.set("current_role_title", input.query.titles.join("|"));
  }
  if (input.query.location) {
    params.set("country", input.query.location);
  }

  let costAccumulated = 0;
  const candidates: ProviderCandidate[] = [];

  try {
    const searchUrl = `https://nubela.co/proxycurl/api/v2/search/person?${params.toString()}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${input.proxycurlKey}` },
    });
    costAccumulated += SEARCH_COST_USD;

    if (!searchRes.ok) {
      return {
        platform: PLATFORM,
        candidates: [],
        cost_usd: costAccumulated,
        error: `Proxycurl search failed: ${searchRes.status} ${searchRes.statusText}`,
      };
    }

    const searchData = (await searchRes.json()) as ProxycurlPersonSearchResult;
    const profileUrls = (searchData.results ?? [])
      .map((r) => r.linkedin_profile_url)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .slice(0, input.nTarget);

    // Fetch each profile sequentially — Proxycurl rate-limits aggressively
    // on parallel calls and we don't want one failed profile to nuke the
    // whole run.
    for (const profileUrl of profileUrls) {
      try {
        const profileRes = await fetch(
          `https://nubela.co/proxycurl/api/v2/linkedin?${new URLSearchParams({
            url: profileUrl,
            skills: "include",
          }).toString()}`,
          { headers: { Authorization: `Bearer ${input.proxycurlKey}` } },
        );
        costAccumulated += PROFILE_COST_USD;

        if (!profileRes.ok) continue;
        const profileData = await profileRes.json();
        const text = formatProxycurlData(profileData, profileUrl);

        const candidate = await normalizeCandidate({ text, model: "haiku" });
        // Ensure source_url + linkedin_url get set to the discovery URL even
        // if the normalize pass didn't carry it through.
        candidate.linkedin_url = candidate.linkedin_url ?? profileUrl;
        candidate.source_url = candidate.source_url ?? profileUrl;

        candidates.push({
          platform: PLATFORM,
          candidate,
          source_url: profileUrl,
          cost_usd: PROFILE_COST_USD,
          note: "proxycurl_profile",
        });
      } catch {
        // Skip individual profile failures
        continue;
      }
    }

    return {
      platform: PLATFORM,
      candidates,
      cost_usd: costAccumulated,
      note: candidates.length === 0 ? "no_results" : undefined,
    };
  } catch (err) {
    return {
      platform: PLATFORM,
      candidates,
      cost_usd: costAccumulated,
      error: err instanceof Error ? err.message : "Unknown LinkedIn error",
    };
  }
}

function formatProxycurlData(data: Record<string, unknown>, profileUrl: string): string {
  const lines: string[] = [];
  lines.push(`LinkedIn profile URL: ${profileUrl}`);
  if (data.full_name) lines.push(`Full Name: ${data.full_name}`);
  if (data.headline) lines.push(`Current Title: ${data.headline}`);
  if (data.location) lines.push(`Location: ${data.location}`);
  if (Array.isArray(data.skills)) {
    lines.push(
      `\nSkills:\n${(data.skills as Array<{ name?: string } | string>)
        .map((s) => (typeof s === "string" ? s : s.name ?? ""))
        .filter(Boolean)
        .map((s) => `- ${s}`)
        .join("\n")}`,
    );
  }
  if (Array.isArray(data.experiences)) {
    lines.push("\nWork Experience:");
    for (const exp of data.experiences as Array<Record<string, unknown>>) {
      lines.push(`\nCompany: ${(exp.company as string) ?? "Unknown"}`);
      if (exp.title) lines.push(`Title: ${exp.title}`);
      if (exp.starts_at && typeof exp.starts_at === "object") {
        lines.push(`Start: ${(exp.starts_at as { date?: string }).date ?? ""}`);
      }
      if (exp.ends_at && typeof exp.ends_at === "object") {
        lines.push(`End: ${(exp.ends_at as { date?: string }).date ?? ""}`);
      }
      if (exp.description) lines.push(`Description: ${exp.description}`);
    }
  }
  if (Array.isArray(data.education)) {
    lines.push("\nEducation:");
    for (const edu of data.education as Array<Record<string, unknown>>) {
      lines.push(`\nInstitution: ${(edu.school as string) ?? "Unknown"}`);
      if (edu.degree_name) lines.push(`Degree: ${edu.degree_name}`);
      if (edu.field_of_study) lines.push(`Field: ${edu.field_of_study}`);
    }
  }
  return lines.join("\n");
}
