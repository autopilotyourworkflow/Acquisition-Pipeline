import { createClient } from "@/lib/supabase/server";
import { ScraperShell } from "./scraper-shell.client";

export default async function ScraperPage() {
  const supabase = await createClient();
  const { data: jds } = await supabase
    .from("job_descriptions")
    .select("id, title")
    .order("created_at", { ascending: false });

  return <ScraperShell initialJds={jds || []} />;
}
