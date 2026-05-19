import { NextResponse, type NextRequest } from "next/server";
import { resolveShortLink } from "@/lib/short-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public link-shortener redirect. The slug is the access control — RLS on
 * short_links allows SELECT for anyone. 12 chars of base62 ≈ 71 bits of
 * entropy, infeasible to enumerate.
 *
 * No auth check by design: calendar invitees (candidates, external
 * panelists) won't have a session in our app but still need to follow
 * these links.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || !/^[0-9A-Za-z]+$/.test(slug)) {
    return new NextResponse("Invalid link.", { status: 400 });
  }

  const result = await resolveShortLink(slug);
  if (!result.ok) {
    if (result.reason === "expired") {
      return new NextResponse(
        "This link has expired. Ask the organizer for a fresh one.",
        { status: 410 },
      );
    }
    return new NextResponse("Link not found.", { status: 404 });
  }

  return NextResponse.redirect(result.url, { status: 302 });
}
