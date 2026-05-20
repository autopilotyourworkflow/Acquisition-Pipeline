import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reconcileWithGoogle } from "@/lib/google/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual sync trigger from the "Refresh from Google" button on /schedule.
 * Same reconciliation that runs automatically on page load — exposed as
 * a POST so HR can force-refresh after deleting an event in Google
 * without having to remember to also refresh the browser.
 *
 * Returns the counts so the UI can show a toast ("3 interviews reconciled,
 * 1 marked cancelled").
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await reconcileWithGoogle({ userId: user.id });
  return NextResponse.json(result);
}
