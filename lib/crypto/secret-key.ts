/**
 * Generic AES-256-GCM helper for storing user-supplied API keys in
 * `user_settings.*_encrypted` bytea columns. Mirrors the format the
 * Google OAuth refresh-token flow already uses — same secret env var,
 * same IV/auth-tag layout — but kept here as a separate entry point so
 * non-OAuth secrets (Proxycurl key, SerpAPI key) don't have to import
 * from `lib/google/*`.
 *
 * Format on disk: `iv (12 bytes) | authTag (16 bytes) | ciphertext`.
 * Persisted as Postgres bytea via PostgREST's `\x<hex>` literal format
 * (see encryptedAsBytea below).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.OAUTH_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "OAUTH_ENCRYPTION_SECRET is not set. Required to encrypt user API keys.",
    );
  }
  if (secret.length !== 64) {
    throw new Error("OAUTH_ENCRYPTION_SECRET must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(secret, "hex");
}

export function encryptUserSecret(plaintext: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * PostgREST's JSON body has no native binary type — passing a Buffer
 * directly gets JSON-stringified to `{"type":"Buffer","data":[…]}` and
 * stored as those JSON bytes in the bytea column, breaking decryption
 * on round-trip. Encode as Postgres bytea hex literal (`\xAABBCC…`)
 * instead — PostgREST recognizes this prefix and decodes correctly.
 */
export function encryptedAsBytea(encrypted: Buffer): string {
  return `\\x${encrypted.toString("hex")}`;
}

function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") {
    if (raw.startsWith("\\x")) return Buffer.from(raw.slice(2), "hex");
    if (/^[0-9a-fA-F]+$/.test(raw)) return Buffer.from(raw, "hex");
    return Buffer.from(raw, "base64");
  }
  throw new Error(`Cannot coerce encrypted value to Buffer (type=${typeof raw})`);
}

export function decryptUserSecret(encrypted: Buffer | Uint8Array | string): string {
  const key = getKey();
  const buf = toBuffer(encrypted);
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
