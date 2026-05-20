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
      className="rounded-sm border border-black bg-transparent px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-black hover:text-yellow"
    >
      Sign out
    </button>
  );
}
