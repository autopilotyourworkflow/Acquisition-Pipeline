"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCandidate } from "@/app/actions/candidates";
import {
  CANDIDATE_SOURCES,
  SOURCE_LABELS,
  type CandidateSource,
} from "@/lib/db/enums";
import type { CandidateRow, JdRow } from "@/lib/db/types";

type EditableCandidate = Pick<
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

type FormShape = {
  full_name: string;
  email: string;
  phone: string;
  current_title: string;
  location: string;
  linkedin_url: string;
  source: CandidateSource;
  source_url: string;
  jd_id: string;
  applied_at: string;
};

function candidateToForm(c: EditableCandidate | null): FormShape {
  return {
    full_name: c?.full_name ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    current_title: c?.current_title ?? "",
    location: c?.location ?? "",
    linkedin_url: c?.linkedin_url ?? "",
    source: c?.source ?? "manual",
    source_url: c?.source_url ?? "",
    jd_id: c?.jd_id ?? "",
    applied_at: c?.applied_at ?? "",
  };
}

/**
 * Controlled edit dialog opened from the tracker's Kanban card / table row.
 * Submits a patch through the updateCandidate server action — every field
 * goes through withAudit, so an edit can be reverted from /activity.
 */
export function EditCandidateDialog({
  candidate,
  jds,
  open,
  onOpenChange,
}: {
  candidate: EditableCandidate | null;
  jds: JdRow[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormShape>(() => candidateToForm(candidate));

  // Reset form contents whenever a different candidate is opened. Without
  // this, opening Aria after editing Marcus would still show Marcus's data.
  useEffect(() => {
    if (open) setForm(candidateToForm(candidate));
  }, [open, candidate]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate) return;
    if (!form.full_name.trim()) {
      toast.error("Name is required");
      return;
    }

    const patch: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      current_title: form.current_title.trim() || null,
      location: form.location.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      source: form.source,
      source_url: form.source_url.trim() || null,
      jd_id: form.jd_id || null,
      applied_at: form.applied_at || candidate.applied_at,
    };

    startTransition(async () => {
      const result = await updateCandidate({
        candidateId: candidate.id,
        patch,
      });
      if (!result.ok) {
        toast.error("Couldn't save changes", { description: result.error });
        return;
      }
      toast.success(`Saved ${form.full_name}`, {
        description: "Reversible from the activity log.",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-black">
            Edit candidate
          </DialogTitle>
          <DialogDescription className="text-black">
            Updates are audit-logged. Stage moves stay on the Kanban — use
            drag-and-drop or the candidate detail page for those.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field id="full_name" label="Full name *">
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              autoFocus
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="email" label="Email">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field id="phone" label="Phone">
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="current_title" label="Current title">
              <Input
                id="current_title"
                value={form.current_title}
                onChange={(e) =>
                  setForm({ ...form, current_title: e.target.value })
                }
              />
            </Field>
            <Field id="location" label="Location">
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
          </div>
          <Field id="linkedin_url" label="LinkedIn URL">
            <Input
              id="linkedin_url"
              value={form.linkedin_url}
              onChange={(e) =>
                setForm({ ...form, linkedin_url: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="source" label="Source">
              <select
                id="source"
                value={form.source}
                onChange={(e) =>
                  setForm({ ...form, source: e.target.value as CandidateSource })
                }
                className="h-9 w-full rounded-md border border-soft-gray bg-white px-3 text-sm text-black"
              >
                {CANDIDATE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="source_url" label="Source URL">
              <Input
                id="source_url"
                value={form.source_url}
                onChange={(e) =>
                  setForm({ ...form, source_url: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="jd_id" label="Job description">
              <select
                id="jd_id"
                value={form.jd_id}
                onChange={(e) => setForm({ ...form, jd_id: e.target.value })}
                className="h-9 w-full rounded-md border border-soft-gray bg-white px-3 text-sm text-black"
              >
                <option value="">— Unassigned —</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="applied_at" label="Applied date">
              <Input
                id="applied_at"
                type="date"
                value={form.applied_at}
                onChange={(e) =>
                  setForm({ ...form, applied_at: e.target.value })
                }
              />
            </Field>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-black">
        {label}
      </Label>
      {children}
    </div>
  );
}
