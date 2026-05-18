import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";
import {
  PROMPT_VERSION as FALLBACK_VERSION,
  SCORING_SYSTEM_PERSONA as FALLBACK_PERSONA,
} from "@/lib/anthropic/prompts/scoring.v1";
import { PromptEditor } from "./prompt-editor.client";

export const metadata = { title: "Scoring prompt · Acquisition" };
export const dynamic = "force-dynamic";

type PromptRow = {
  id: string;
  version: string;
  persona_text: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export default async function PromptsPage() {
  const admin = createAdminClient();
  const { data: prompts, error } = await admin
    .from("scoring_prompts")
    .select("id, version, persona_text, is_active, created_by, created_at")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: false });

  // If migration hasn't been applied, fall back to the file-based default.
  const migrationApplied = !error;
  const rows = (prompts ?? []) as PromptRow[];
  const active = rows.find((r) => r.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Scoring prompt</h1>
        <p className="mt-1 text-sm text-charcoal">
          The persona text that goes into Claude&apos;s system prompt at score time. Changes
          take effect on the next <code className="font-mono text-xs">Run score</code>.
          Saving creates a new version (e.g. <code className="font-mono text-xs">scoring.v2</code>);
          existing scores keep their original version on the row.
        </p>
      </div>

      {!migrationApplied && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <p className="font-medium">Migration not applied</p>
          <p className="mt-1 text-charcoal">
            Run <code className="font-mono">supabase/migrations/0002_phase2_fixes.sql</code> in the
            Supabase SQL editor to enable editable prompts. Until then, scoring uses the
            hardcoded <code className="font-mono">scoring.v1</code> fallback.
          </p>
        </div>
      )}

      <PromptEditor
        initialText={active?.persona_text ?? FALLBACK_PERSONA}
        activeVersion={active?.version ?? `${FALLBACK_VERSION} (fallback)`}
        disabled={!migrationApplied}
      />

      {rows.length > 1 && (
        <div className="rounded-lg border border-sand-200 bg-warm-white">
          <div className="border-b border-sand-200 px-4 py-2.5">
            <p className="text-xs uppercase tracking-wide text-slate-deep">Version history</p>
          </div>
          <ul className="divide-y divide-sand-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-mono text-navy">{r.version}</span>
                  {r.is_active && (
                    <span className="ml-2 rounded-sm bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                      active
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-deep">
                  {new Date(r.created_at).toLocaleString("en-GB", {
                    timeZone: "Asia/Bangkok",
                    hour12: false,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
