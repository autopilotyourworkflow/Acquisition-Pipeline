"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md border border-sand-200 bg-warm-white px-3 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-sand-100 hover:text-navy"
    >
      Sign out
    </button>
  );
}
