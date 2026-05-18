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
    let proxycurlKey = apiKey;
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

          const profileData = await proxycurlResponse.json();

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

function formatProxycurlData(data: any): string {
  const lines: string[] = [];

  if (data.full_name) lines.push(`Full Name: ${data.full_name}`);
  if (data.email) lines.push(`Email: ${data.email}`);
  if (data.phone_number) lines.push(`Phone: ${data.phone_number}`);
  if (data.headline) lines.push(`Current Title: ${data.headline}`);
  if (data.location) lines.push(`Location: ${data.location}`);
  if (data.profile_pic_url) lines.push(`Profile Picture: ${data.profile_pic_url}`);

  if (data.skills && Array.isArray(data.skills)) {
    lines.push(`\nSkills:\n${data.skills.map((s: any) => `- ${s.name}`).join("\n")}`);
  }

  if (data.experiences && Array.isArray(data.experiences)) {
    lines.push(`\nWork Experience:`);
    for (const exp of data.experiences) {
      lines.push(`\nCompany: ${exp.company || "Unknown"}`);
      if (exp.title) lines.push(`Title: ${exp.title}`);
      if (exp.starts_at) lines.push(`Start: ${exp.starts_at.date}`);
      if (exp.ends_at) lines.push(`End: ${exp.ends_at.date}`);
      if (exp.description) lines.push(`Description: ${exp.description}`);
    }
  }

  if (data.education && Array.isArray(data.education)) {
    lines.push(`\nEducation:`);
    for (const edu of data.education) {
      lines.push(`\nInstitution: ${edu.school || "Unknown"}`);
      if (edu.degree_name) lines.push(`Degree: ${edu.degree_name}`);
      if (edu.field_of_study) lines.push(`Field: ${edu.field_of_study}`);
      if (edu.ends_at) lines.push(`Graduation: ${edu.ends_at.date}`);
    }
  }

  return lines.join("\n");
}
