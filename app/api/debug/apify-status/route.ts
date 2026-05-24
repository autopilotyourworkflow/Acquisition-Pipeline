import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptUserSecret } from "@/lib/crypto/secret-key";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic endpoint — owner-only.
 * Helps verify whether the user's Apify token is still decryptable
 * (rules out "OAUTH_ENCRYPTION_SECRET was rotated" as the cause of a
 * disappeared key). Returns no secret values — just lengths + a hash
 * fingerprint of the encryption secret so you can compare across deploys.
 *
 * SAFE TO DELETE once the diagnostic is done.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settings, error } = await admin
    .from("user_settings")
    .select("apify_api_token_encrypted, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result: Record<string, unknown> = {
    userId: user.id,
    userEmail: user.email ?? null,
    isAnonymous: user.is_anonymous ?? false,
    hasUserSettingsRow: Boolean(settings),
    apifyEncryptedPresent: Boolean(settings?.apify_api_token_encrypted),
    apifyUpdatedAt: settings?.updated_at ?? null,
    hasSystemDefaultEnvVar: Boolean(process.env.APIFY_API_TOKEN),
    encryptionSecretFingerprint: fingerprintEnv("OAUTH_ENCRYPTION_SECRET"),
  };

  if (settings?.apify_api_token_encrypted) {
    try {
      const decrypted = decryptUserSecret(
        settings.apify_api_token_encrypted as Buffer | Uint8Array | string,
      );
      result.decryptOk = true;
      result.decryptedLength = decrypted.length;
      result.looksLikeApifyKey = decrypted.startsWith("apify_api_");
    } catch (err) {
      result.decryptOk = false;
      result.decryptError = err instanceof Error ? err.message : "unknown";
    }
  } else {
    result.decryptOk = null;
  }

  return NextResponse.json(result, { status: 200 });
}

function fingerprintEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  return createHash("sha256").update(v).digest("hex").slice(0, 12);
}
