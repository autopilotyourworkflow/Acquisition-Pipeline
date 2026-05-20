import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated Supabase user, deduplicated for the lifetime of
 * a single server request. React's `cache()` ensures that when a layout AND
 * the page it wraps both call this, only one round-trip to Supabase Auth
 * is issued instead of two. Cuts ~50-150ms off every navigation.
 *
 * Pages and layouts that previously did `await supabase.auth.getUser()`
 * directly should call `getCurrentUser()` instead.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
