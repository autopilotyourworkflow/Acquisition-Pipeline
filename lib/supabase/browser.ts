import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Reads/writes the auth session
 * through document.cookie so browser-side calls also respect RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
