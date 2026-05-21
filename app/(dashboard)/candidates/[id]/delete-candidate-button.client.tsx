"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteCandidate } from "@/app/actions/candidates";

export function DeleteCandidateButton({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteCandidate({ candidateId });
      if (!result.ok) {
        toast.error(`Couldn't delete candidate: ${result.error}`);
        return;
      }
      // Hard delete is captured in the activity log — the toast offers the
      // route to undo. The audit row carries the full `before` snapshot, so
      // /activity → "Undo" restores the candidate cleanly.
      toast.success(`Deleted ${candidateName}`, {
        description: "Reversible from the activity log.",
        action: {
          label: "Activity",
          onClick: () => router.push("/activity"),
        },
      });
      setOpen(false);
      router.push("/tracker");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-sm border border-danger/40 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/10"
        >
          Delete candidate
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this candidate?</DialogTitle>
          <DialogDescription>
            Removes <span className="font-semibold text-black">{candidateName}</span>{" "}
            from the tracker. All scores, interviews, and attachments
            associated with this candidate stay in the database for the
            activity log&apos;s undo path — you can restore the candidate
            from <span className="font-mono text-black">/activity</span>{" "}
            at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-sm border border-soft-gray bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-off-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-sm bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-[filter] hover:brightness-95 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete candidate"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
