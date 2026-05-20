"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptUserSecret, encryptedAsBytea } from "@/lib/crypto/secret-key";

/**
 * Server Actions for the user-level integration keys stored encrypted in
 * `user_settings`. Only the per-user owner can read/write their own row
 * (RLS), and we never echo decrypted values back through these actions.
 */

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

type KeyField =
  | "proxycurl_api_key_encrypted"
  | "serpapi_key_encrypted"
  | "apify_api_token_encrypted";

async function upsertEncrypted(userId: string, field: KeyField, value: string) {
  const admin = createAdminClient();
  const encrypted = encryptUserSecret(value);
  const { error } = await admin
    .from("user_settings")
    .upsert({ user_id: userId, [field]: encryptedAsBytea(encrypted) });
  if (error) throw error;
}

async function clearField(userId: string, field: KeyField) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_settings")
    .upsert({ user_id: userId, [field]: null });
  if (error) throw error;
}

export async function saveProxycurlKey(input: {
  value: string;
}): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    const trimmed = input.value.trim();
    if (!trimmed) return { ok: false, error: "Empty key" };
    await upsertEncrypted(userId, "proxycurl_api_key_encrypted", trimmed);
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clearProxycurlKey(): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    await clearField(userId, "proxycurl_api_key_encrypted");
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function saveSerpapiKey(input: {
  value: string;
}): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    const trimmed = input.value.trim();
    if (!trimmed) return { ok: false, error: "Empty key" };
    await upsertEncrypted(userId, "serpapi_key_encrypted", trimmed);
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clearSerpapiKey(): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    await clearField(userId, "serpapi_key_encrypted");
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function saveApifyToken(input: {
  value: string;
}): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    const trimmed = input.value.trim();
    if (!trimmed) return { ok: false, error: "Empty token" };
    await upsertEncrypted(userId, "apify_api_token_encrypted", trimmed);
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clearApifyToken(): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    await clearField(userId, "apify_api_token_encrypted");
    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
