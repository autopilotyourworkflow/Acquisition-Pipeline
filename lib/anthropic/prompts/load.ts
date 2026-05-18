import { createAdminClient } from "@/lib/supabase/admin";
import {
  PROMPT_VERSION as FALLBACK_VERSION,
  SCORING_SYSTEM_PERSONA as FALLBACK_PERSONA,
  buildScoringMessages,
} from "@/lib/anthropic/prompts/scoring.v1";

export type ActivePrompt = {
  version: string;
  personaText: string;
};

/**
 * Load the org's currently active scoring prompt. Falls back to the hardcoded
 * `scoring.v1` constant if the DB is unreachable or the migration hasn't been
 * applied yet — that way the scoring endpoint never breaks because of a
 * settings page outage.
 */
export async function loadActiveScoringPrompt(): Promise<ActivePrompt> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("scoring_prompts")
      .select("version, persona_text")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { version: FALLBACK_VERSION, personaText: FALLBACK_PERSONA };
    }
    return { version: data.version as string, personaText: data.persona_text as string };
  } catch {
    return { version: FALLBACK_VERSION, personaText: FALLBACK_PERSONA };
  }
}

/**
 * Resolve the scoring persona for a specific JD. If the JD has a non-empty
 * `scoring_persona_override`, use it (with a JD-specific version label). Else
 * fall back to the org-wide active prompt.
 */
export async function loadScoringPromptForJd(jd: {
  id: string;
  scoring_persona_override: string | null;
}): Promise<ActivePrompt> {
  const override = jd.scoring_persona_override?.trim();
  if (override && override.length > 50) {
    return {
      version: `jd-${jd.id.slice(0, 8)}:custom`,
      personaText: override,
    };
  }
  return loadActiveScoringPrompt();
}

/**
 * Build the scoring messages using a specific persona — separated out so the
 * route handler can use the active prompt from DB while keeping the message
 * structure (cacheable JD block, user message) constant.
 */
export function buildScoringMessagesWithPersona(
  personaText: string,
  args: Parameters<typeof buildScoringMessages>[0],
) {
  const built = buildScoringMessages(args);
  return {
    system: [
      { type: "text" as const, text: personaText },
      ...built.system.slice(1), // drop the hardcoded persona, keep the cacheable JD block
    ],
    messages: built.messages,
  };
}
