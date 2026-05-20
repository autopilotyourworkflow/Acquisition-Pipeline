import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkBusy } from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

/**
 * Warn-only conflict detector for /schedule/new. Reads the booker's primary
 * calendar via FreeBusy and returns overlapping busy blocks so the form can
 * surface an inline warning. Read-only — no audit wrap, no DB mutation.
 *
 * Auth-degrade is handled by `checkBusy`: if Google isn't connected, this
 * still returns `{ conflicts: [] }` so the form doesn't need to special-case
 * the OTP-only user path.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await checkBusy({
    userId: user.id,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
  });

  return NextResponse.json(result);
}
