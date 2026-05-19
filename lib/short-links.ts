import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";

/**
 * Internal URL shortener. Backed by the short_links table. Used to turn
 * long signed Storage URLs into clean /l/<slug> links for calendar invites.
 *
 * Slug is base62 from crypto-random bytes: 12 chars ≈ 71 bits of entropy.
 * That's the access control — RLS allows public SELECT so calendar
 * invitees (who don't have an app session) can resolve the slug.
 */

const SLUG_LENGTH = 12;
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += BASE62[bytes[i]! % 62];
  }
  return out;
}

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/+$/, "");
  }
  // Fallback for local dev — prod always sets the env var.
  return "http://localhost:3000";
}

export type CreateShortLinkArgs = {
  url: string;
  ttlSeconds: number;
  userId?: string | null;
};

export type CreateShortLinkResult = {
  slug: string;
  shortUrl: string;
};

export async function createShortLink(
  args: CreateShortLinkArgs,
): Promise<CreateShortLinkResult> {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + args.ttlSeconds * 1000).toISOString();

  // Retry on the (extremely unlikely) collision. 71 bits of entropy means
  // we'd need ~100M existing rows for a 50% collision chance. Three retries
  // is engineering paranoia, not real risk mitigation.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = randomSlug();
    const { error } = await admin.from("short_links").insert({
      slug,
      url: args.url,
      expires_at: expiresAt,
      org_id: ORG_ID,
      created_by: args.userId ?? null,
    });
    if (!error) {
      return { slug, shortUrl: `${appBaseUrl()}/l/${slug}` };
    }
    // Unique-violation = 23505 in Postgres. Anything else, bail.
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(`short_links insert failed: ${error.message}`);
    }
  }
  throw new Error("short_links: exhausted slug collision retries");
}

export type ResolveShortLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: "not_found" | "expired" };

export async function resolveShortLink(
  slug: string,
): Promise<ResolveShortLinkResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("short_links")
    .select("url, expires_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  if (data.expires_at) {
    const expiresMs = new Date(data.expires_at as string).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }
  return { ok: true, url: data.url as string };
}
