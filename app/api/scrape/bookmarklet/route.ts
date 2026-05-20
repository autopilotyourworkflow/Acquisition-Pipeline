/**
 * POST /api/scrape/bookmarklet
 *
 * Endpoint the JobsDB / LinkedIn bookmarklet posts to. Token-authenticated
 * (no cookies, because it's called cross-origin from jobsdb.com /
 * linkedin.com). CORS-open: the token IS the auth.
 *
 * Body: { text: string, sourceUrl?: string }
 * Headers: Authorization: Bearer <bookmarklet_token>
 *
 * Response: { ok: true, candidateId, full_name } | { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { normalizeCandidate } from "@/lib/scrape/normalize";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateSource } from "@/lib/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  // The bookmarklet posts from arbitrary origins (jobsdb.com / linkedin.com /
  // wherever the user is logged in). The auth lives in the Authorization
  // header, not a cookie, so credentials-mode isn't required and we can
  // safely allow * for origin.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function detectSource(url: string | undefined): CandidateSource {
  if (!url) return "extension";
  const lower = url.toLowerCase();
  if (lower.includes("jobsdb")) return "jobsdb";
  if (lower.includes("linkedin")) return "linkedin";
  return "extension";
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders();
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing bookmarklet token" },
        { status: 401, headers },
      );
    }

    const admin = createAdminClient();
    const { data: settings, error: lookupErr } = await admin
      .from("user_settings")
      .select("user_id")
      .eq("bookmarklet_token", token)
      .maybeSingle();
    if (lookupErr || !settings?.user_id) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired bookmarklet token" },
        { status: 401, headers },
      );
    }
    const userId = settings.user_id as string;

    const body = (await req.json().catch(() => null)) as
      | { text?: string; sourceUrl?: string }
      | null;
    const text = body?.text?.trim() ?? "";
    if (text.length < 80) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Page text is too short — make sure you're on a candidate detail page, not the search results.",
        },
        { status: 400, headers },
      );
    }

    const sourceUrl = body?.sourceUrl ?? undefined;
    const source = detectSource(sourceUrl);

    // Hint the normalizer about the source so it doesn't confuse a job
    // listing with a candidate profile.
    const hinted =
      `Source: ${source === "jobsdb" ? "JobsDB" : source === "linkedin" ? "LinkedIn" : "Bookmarklet capture"} candidate page.\n` +
      (sourceUrl ? `URL: ${sourceUrl}\n` : "") +
      "\n" +
      text;

    const candidate = await normalizeCandidate({ text: hinted, model: "haiku" });

    // Money guard — the normalize pass occasionally returns "<UNKNOWN>"
    // when handed a non-candidate page. Drop those before insert.
    const name = candidate.full_name?.trim() ?? "";
    if (
      name.length < 3 ||
      ["unknown", "<unknown>", "candidate", "n/a"].includes(name.toLowerCase())
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Couldn't find a real candidate on that page. Make sure you're on a candidate detail view, not a search/listing page.",
        },
        { status: 422, headers },
      );
    }

    const insertPayload = {
      org_id: ORG_ID,
      full_name: name,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
      current_title: candidate.current_title ?? null,
      location: candidate.location ?? null,
      linkedin_url: candidate.linkedin_url ?? null,
      source,
      source_url: sourceUrl ?? candidate.source_url ?? null,
      raw_profile: {
        ...candidate,
        bookmarklet_capture: true,
        captured_at: new Date().toISOString(),
      },
      stage: "applied" as const,
      created_by: userId,
    };

    const { data: inserted, error: insErr } = await admin
      .from("candidates")
      .insert(insertPayload)
      .select()
      .single();
    if (insErr || !inserted) {
      return NextResponse.json(
        { ok: false, error: insErr?.message ?? "Insert failed" },
        { status: 500, headers },
      );
    }

    const rowHash = computeRowHash(inserted as Record<string, unknown>);
    await admin
      .from("candidates")
      .update({ row_hash: rowHash })
      .eq("id", inserted.id);

    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "insert",
      table: "candidates",
      targetId: inserted.id as string,
      before: null,
      mutate: async () => ({ ...(inserted as Record<string, unknown>), row_hash: rowHash }),
    });

    return NextResponse.json(
      {
        ok: true,
        candidateId: inserted.id,
        full_name: name,
        source,
      },
      { status: 200, headers },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500, headers },
    );
  }
}
