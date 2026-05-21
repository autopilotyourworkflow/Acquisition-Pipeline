"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditCandidateDialog } from "./edit-candidate-dialog.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

/**
 * Server-component-friendly launcher for the EditCandidateDialog. The
 * candidate detail page is a server component, so it can't own the dialog's
 * open state itself — this wrapper bridges that gap.
 */
export function EditCandidateLauncher({
  candidate,
  jds,
}: {
  candidate: Pick<
    CandidateRow,
    | "id"
    | "full_name"
    | "email"
    | "phone"
    | "current_title"
    | "location"
    | "linkedin_url"
    | "source"
    | "source_url"
    | "jd_id"
    | "applied_at"
  >;
  jds: JdRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit candidate
      </Button>
      <EditCandidateDialog
        candidate={candidate}
        jds={jds}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
