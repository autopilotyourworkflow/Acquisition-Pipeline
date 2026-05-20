"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ColdEmailDialog } from "./ColdEmailDialog.client";

/**
 * Server-component-friendly wrapper around ColdEmailDialog. The candidate
 * detail page is a server component, so it can't hold `open` state itself —
 * this client wrapper bridges that gap.
 *
 * Visibility rules (enforced by the parent passing the props):
 *   - hasGmailSend  — gmail.send scope must be granted
 *   - candidate.email — recipient must exist
 *   - jdId           — must be tied to a JD (the email is JD-scoped)
 *
 * If any precondition is missing, the parent passes a disabled-shape
 * variant of the button with an explanatory tooltip via `title`.
 */

type Props = {
  candidate: { id: string; full_name: string; email: string | null; current_stage: string };
  jdId: string | null;
  jdTitle: string | null;
  hasGmailSend: boolean;
};

export function ColdEmailLauncher({
  candidate,
  jdId,
  jdTitle,
  hasGmailSend,
}: Props) {
  const [open, setOpen] = useState(false);

  // Missing-precondition states render an explanatory disabled button so
  // HR understands WHY the button isn't actionable rather than just seeing
  // an empty space.
  if (!candidate.email) {
    return (
      <Button
        variant="outline"
        disabled
        title="Candidate has no email on file — add one before drafting an outreach."
      >
        Draft cold email
      </Button>
    );
  }
  if (!jdId || !jdTitle) {
    return (
      <Button
        variant="outline"
        disabled
        title="Candidate isn't tied to a JD. Set a JD first so the email can be tailored."
      >
        Draft cold email
      </Button>
    );
  }
  if (!hasGmailSend) {
    return (
      <Button
        asChild
        variant="outline"
        title="Gmail Send permission not granted. Click to set up integrations."
      >
        <Link href="/settings/integrations">Draft cold email · grant Gmail</Link>
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Draft cold email</Button>
      {open && (
        <ColdEmailDialog
          open={open}
          onOpenChange={setOpen}
          candidate={{
            id: candidate.id,
            full_name: candidate.full_name,
            email: candidate.email,
            current_stage: candidate.current_stage,
          }}
          jdId={jdId}
          jdTitle={jdTitle}
        />
      )}
    </>
  );
}
