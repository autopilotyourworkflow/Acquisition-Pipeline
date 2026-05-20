"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { userId: user.id };
}

/**
 * Generate a fresh per-user bookmarklet token. The token is embedded in
 * the JS snippet HR drags to their bookmarks bar. POSTs from that snippet
 * include the token in the Authorization header; the bookmarklet endpoint
 * resolves it back to this user before normalizing + inserting.
 *
 * Rotates on every call — clicking "Regenerate" invalidates the previous
 * bookmark. Anyone with the previous token loses access immediately.
 */
export async function regenerateBookmarkletToken(): Promise<
  ActionResult<{ token: string }>
> {
  try {
    const { userId } = await getActor();
    const admin = createAdminClient();
    const token = randomBytes(32).toString("base64url");
    const { error } = await admin
      .from("user_settings")
      .upsert({ user_id: userId, bookmarklet_token: token });
    if (error) throw error;
    revalidatePath("/settings/integrations");
    return { ok: true, data: { token } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function clearBookmarkletToken(): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_settings")
      .upsert({ user_id: userId, bookmarklet_token: null });
    if (error) throw error;
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
