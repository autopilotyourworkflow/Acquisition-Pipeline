"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ColdEmailDialog, type PastEmail } from "./ColdEmailDialog.client";

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
 *
 * `pastEmails` is the latest 10 drafts/sends for this candidate+JD, fetched
 * server-side and threaded through so the dialog can render its history
 * panel instantly on open (no extra round-trip).
 */

type Props = {
  candidate: { id: string; full_name: string; email: string | null; current_stage: string };
  jdId: string | null;
  jdTitle: string | null;
  hasGmailSend: boolean;
  pastEmails: PastEmail[];
};

export function ColdEmailLauncher({
  candidate,
  jdId,
  jdTitle,
  hasGmailSend,
  pastEmails,
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
      <Button onClick={() => setOpen(true)}>
        Draft cold email
        {pastEmails.length > 0 && (
          <span className="ml-1.5 rounded-sm bg-warm-white/20 px-1 font-mono text-[10px]">
            {pastEmails.length}
          </span>
        )}
      </Button>
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
          initialPastEmails={pastEmails}
        />
      )}
    </>
  );
}
