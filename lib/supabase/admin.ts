import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER-ONLY. Bypasses RLS — use sparingly and never
 * import from a 'use client' file.
 *
 * Use cases:
 *   - Inserting into activity_log (must run regardless of user RLS scope)
 *   - Creating invitations
 *   - Storing oauth_tokens for a user (insert under their user_id but
 *     orchestrated server-side after the OAuth callback)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. " +
        "Service-role client cannot be created.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
