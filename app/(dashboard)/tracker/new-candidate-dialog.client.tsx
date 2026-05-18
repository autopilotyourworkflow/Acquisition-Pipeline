"use client";

import { useState, useTransition } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCandidate } from "@/app/actions/candidates";
import type { JdRow } from "@/lib/db/types";

export function NewCandidateDialog({ jds }: { jds: JdRow[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    current_title: "",
    location: "",
    linkedin_url: "",
    jd_id: jds[0]?.id ?? "",
    notes: "",
  });

  function reset() {
    setForm({
      full_name: "",
      email: "",
      current_title: "",
      location: "",
      linkedin_url: "",
      jd_id: jds[0]?.id ?? "",
      notes: "",
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const result = await createCandidate({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        current_title: form.current_title.trim() || null,
        location: form.location.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        jd_id: form.jd_id || null,
        notes: form.notes.trim() || null,
        source: "manual",
      });
      if (!result.ok) {
        toast.error("Couldn't create candidate", { description: result.error });
        return;
      }
      toast.success(`Added ${form.full_name}`);
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ New candidate</Button>
      </DialogTrigger>
      <DialogContent className="bg-warm-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">New candidate</DialogTitle>
          <DialogDescription className="text-charcoal">
            Manual entry. For Day 3, the Scraper module will populate this
            automatically from LinkedIn / paste / PDF / screenshot.
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
            <Field id="current_title" label="Current title">
              <Input
                id="current_title"
                value={form.current_title}
                onChange={(e) => setForm({ ...form, current_title: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="location" label="Location">
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field id="linkedin_url" label="LinkedIn URL">
              <Input
                id="linkedin_url"
                value={form.linkedin_url}
                onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
              />
            </Field>
          </div>
          <Field id="jd_id" label="Job description">
            <select
              id="jd_id"
              value={form.jd_id}
              onChange={(e) => setForm({ ...form, jd_id: e.target.value })}
              className="h-9 w-full rounded-md border border-sand-200 bg-warm-white px-3 text-sm text-navy"
            >
              <option value="">— Unassigned —</option>
              {jds.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </Field>
          <Field id="notes" label="Notes">
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add candidate"}
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
      <Label htmlFor={id} className="text-xs text-slate-deep">
        {label}
      </Label>
      {children}
    </div>
  );
}
