import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/emails/list?candidateId=...&jdId=...
 *
 * Returns the recent emails (drafts + sends) for the given candidate
 * within the given JD's context. Used by the ColdEmailDialog to show
 * a history panel — the user can click a past draft to load it into
 * the editor without paying for a fresh AI generation.
 *
 * Limited to the last 10 entries (drafts pile up fast if the user
 * regenerates a few times). Failed sends are excluded — they're noise.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const candidateId = url.searchParams.get("candidateId");
  const jdId = url.searchParams.get("jdId");

  if (!candidateId) {
    return new Response(
      JSON.stringify({ error: "candidateId is required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  let query = supabase
    .from("emails")
    .select(
      "id, status, subject, body_markdown, rationale, sent_at, gmail_message_id, created_at, updated_at",
    )
    .eq("candidate_id", candidateId)
    .in("status", ["drafted", "sent"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (jdId) query = query.eq("jd_id", jdId);

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ emails: data ?? [] }), {
    headers: { "content-type": "application/json" },
  });
}
