import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeCandidate } from "@/lib/scrape/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScrapeThirdPartyRequest {
  linkedinUrl: string;
  apiKey?: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const { linkedinUrl, apiKey } = (await req.json()) as ScrapeThirdPartyRequest;

    if (!linkedinUrl) {
      return NextResponse.json({ error: "LinkedIn URL is required" }, { status: 400 });
    }

    // Get the API key from request or from user_settings
    const proxycurlKey = apiKey;
    if (!proxycurlKey) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      // Fetch from user_settings (note: would need to decrypt if we stored it encrypted)
      // For now, user must provide the key in the request
      return NextResponse.json(
        { error: "Proxycurl API key not configured. Please provide it in request or configure in settings." },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));

        try {
          emit("scrape_progress", { status: "fetching_profile", linkedinUrl });

          // Call Proxycurl API
          const queryParams = new URLSearchParams({
            url: linkedinUrl,
            extra: "include",
            github_profile_id: "include",
            facebook_profile_id: "include",
            twitter_profile_id: "include",
            personal_website: "include",
            skills: "include",
            inferred_salary: "include",
          });

          const proxycurlResponse = await fetch(
            `https://nubela.co/proxycurl/api/v2/linkedin?${queryParams.toString()}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${proxycurlKey}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
            },
          );

          if (!proxycurlResponse.ok) {
            throw new Error(
              `Proxycurl API error: ${proxycurlResponse.status} ${proxycurlResponse.statusText}`,
            );
          }

          const profileData = (await proxycurlResponse.json()) as ProxycurlData;

          emit("scrape_progress", { status: "normalizing" });

          // Format the Proxycurl data as text for normalization
          const profileText = formatProxycurlData(profileData);

          // Normalize through Claude
          const candidate = await normalizeCandidate({
            text: profileText,
            model: "haiku",
          });

          emit("scrape_complete", {
            candidate,
            sourceUrl: linkedinUrl,
            source: "linkedin",
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          emit("scrape_error", { message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}

/**
 * Proxycurl returns a richly-nested JSON object whose schema isn't strictly
 * versioned; we treat it as a loose record and read the few fields we care
 * about defensively. Strong typing here would be aspirational — the cost
 * of getting it wrong is "one row in the email field stays blank."
 */
type ProxycurlData = Record<string, unknown>;

function formatProxycurlData(data: ProxycurlData): string {
  const lines: string[] = [];
  const str = (k: string): string | undefined =>
    typeof data[k] === "string" ? (data[k] as string) : undefined;
  const arr = (k: string): unknown[] | undefined =>
    Array.isArray(data[k]) ? (data[k] as unknown[]) : undefined;

  if (str("full_name")) lines.push(`Full Name: ${str("full_name")}`);
  if (str("email")) lines.push(`Email: ${str("email")}`);
  if (str("phone_number")) lines.push(`Phone: ${str("phone_number")}`);
  if (str("headline")) lines.push(`Current Title: ${str("headline")}`);
  if (str("location")) lines.push(`Location: ${str("location")}`);
  if (str("profile_pic_url"))
    lines.push(`Profile Picture: ${str("profile_pic_url")}`);

  const skills = arr("skills");
  if (skills) {
    lines.push(
      `\nSkills:\n${skills
        .map((s) =>
          typeof s === "object" && s !== null && "name" in s
            ? `- ${(s as { name: string }).name}`
            : `- ${String(s)}`,
        )
        .join("\n")}`,
    );
  }

  const experiences = arr("experiences");
  if (experiences) {
    lines.push(`\nWork Experience:`);
    for (const raw of experiences) {
      const exp = raw as Record<string, unknown>;
      lines.push(`\nCompany: ${(exp.company as string) || "Unknown"}`);
      if (exp.title) lines.push(`Title: ${exp.title}`);
      const sa = exp.starts_at as { date?: string } | undefined;
      const ea = exp.ends_at as { date?: string } | undefined;
      if (sa?.date) lines.push(`Start: ${sa.date}`);
      if (ea?.date) lines.push(`End: ${ea.date}`);
      if (exp.description) lines.push(`Description: ${exp.description}`);
    }
  }

  const education = arr("education");
  if (education) {
    lines.push(`\nEducation:`);
    for (const raw of education) {
      const edu = raw as Record<string, unknown>;
      lines.push(`\nInstitution: ${(edu.school as string) || "Unknown"}`);
      if (edu.degree_name) lines.push(`Degree: ${edu.degree_name}`);
      if (edu.field_of_study) lines.push(`Field: ${edu.field_of_study}`);
      const ea = edu.ends_at as { date?: string } | undefined;
      if (ea?.date) lines.push(`Graduation: ${ea.date}`);
    }
  }

  return lines.join("\n");
}
