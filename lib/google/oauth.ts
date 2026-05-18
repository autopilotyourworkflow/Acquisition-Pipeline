import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.OAUTH_ENCRYPTION_SECRET;
  if (!secret) throw new Error("OAUTH_ENCRYPTION_SECRET is not set");
  if (secret.length !== 64) throw new Error("OAUTH_ENCRYPTION_SECRET must be 64 hex chars (32 bytes)");
  return Buffer.from(secret, "hex");
}

export function encryptRefreshToken(token: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptRefreshToken(encrypted: Buffer): string {
  const key = getKey();

  if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

export async function upsertOAuthTokens(input: {
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
}): Promise<void> {
  const admin = await createAdminClient();
  const encryptedRefreshToken = encryptRefreshToken(input.refreshToken);
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();

  const { error } = await admin.from("oauth_tokens").upsert({
    user_id: input.userId,
    provider: input.provider,
    access_token: input.accessToken,
    refresh_token_encrypted: encryptedRefreshToken,
    expires_at: expiresAt,
    scopes: input.scopes,
  });

  if (error) throw error;
}

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" | "revoked" | "error"; message?: string };

export async function getGoogleAccessToken(userId: string): Promise<TokenResult> {
  const admin = await createAdminClient();

  // Fetch the stored token row
  const { data, error: fetchErr } = await admin
    .from("oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .single();

  if (fetchErr || !data) {
    return { ok: false, reason: "not_connected" };
  }

  // Check if token is still fresh (more than 60 seconds left)
  const expiresAt = new Date(data.expires_at).getTime();
  const now = Date.now();
  const timeLeft = expiresAt - now;

  if (timeLeft > 60 * 1000) {
    return { ok: true, accessToken: data.access_token };
  }

  // Token expired, refresh it
  try {
    const decryptedRefreshToken = decryptRefreshToken(data.refresh_token_encrypted);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
      }).toString(),
    });

    const result = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (result.error) {
      if (result.error === "invalid_grant") {
        // Token revoked, delete the row
        await admin.from("oauth_tokens").delete().eq("user_id", userId);
        return { ok: false, reason: "revoked" };
      }
      return { ok: false, reason: "error", message: result.error_description };
    }

    if (!result.access_token) {
      return { ok: false, reason: "error", message: "No access token in response" };
    }

    // Upsert new token (and optionally new refresh token if Google rotated it)
    const newRefreshToken = result.refresh_token || decryptedRefreshToken;
    const expiresIn = result.expires_in || 3600;

    await upsertOAuthTokens({
      userId,
      provider: "google",
      accessToken: result.access_token,
      refreshToken: newRefreshToken,
      expiresIn,
      scopes: data.scopes,
    });

    return { ok: true, accessToken: result.access_token };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Unknown error refreshing token",
    };
  }
}
