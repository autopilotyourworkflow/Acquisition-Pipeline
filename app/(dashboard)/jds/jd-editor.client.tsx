"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createJd, updateJd, deleteJd } from "@/app/actions/jds";
import type { JdRow } from "@/lib/db/types";

type Form = {
  title: string;
  department: string;
  location: string;
  body_markdown: string;
  must_have_csv: string;
  nice_to_have_csv: string;
  threshold: string;
};

function rowToForm(jd?: JdRow): Form {
  return {
    title: jd?.title ?? "",
    department: jd?.department ?? "",
    location: jd?.location ?? "",
    body_markdown: jd?.body_markdown ?? "",
    must_have_csv: jd?.must_have.join(", ") ?? "",
    nice_to_have_csv: jd?.nice_to_have.join(", ") ?? "",
    threshold: jd?.threshold?.toString() ?? "7.0",
  };
}

function csvToArray(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function JdEditor({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: JdRow;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(rowToForm(initial));
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.body_markdown.trim()) {
      toast.error("JD body is required");
      return;
    }
    const threshold = Number(form.threshold);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 10) {
      toast.error("Threshold must be a number between 0 and 10");
      return;
    }

    const payload = {
      title: form.title.trim(),
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      body_markdown: form.body_markdown.trim(),
      must_have: csvToArray(form.must_have_csv),
      nice_to_have: csvToArray(form.nice_to_have_csv),
      threshold,
    };

    startTransition(async () => {
      if (mode === "create") {
        const result = await createJd(payload);
        if (!result.ok) {
          toast.error("Couldn't create JD", { description: result.error });
          return;
        }
        toast.success("JD created");
        router.push(`/jds/${result.data.id}`);
      } else if (initial) {
        const result = await updateJd({ jdId: initial.id, patch: payload });
        if (!result.ok) {
          toast.error("Couldn't save JD", { description: result.error });
          return;
        }
        toast.success("JD saved");
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (!window.confirm(`Delete "${initial.title}"? This cannot be undone (yet — Day 4 lands undo).`)) return;
    startDeleteTransition(async () => {
      const result = await deleteJd({ jdId: initial.id });
      if (!result.ok) {
        toast.error("Couldn't delete JD", { description: result.error });
        return;
      }
      toast.success("JD deleted");
      router.push("/jds");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-sand-200 bg-warm-white p-6">
      <div className="grid grid-cols-2 gap-3">
        <Field id="title" label="Title *">
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </Field>
        <Field id="threshold" label="Pass threshold (0-10)">
          <Input
            id="threshold"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            inputMode="decimal"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="department" label="Department">
          <Input
            id="department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
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
      <Field id="must_have_csv" label="Must-have (comma-separated)">
        <Input
          id="must_have_csv"
          value={form.must_have_csv}
          onChange={(e) => setForm({ ...form, must_have_csv: e.target.value })}
          placeholder="TypeScript, React, Node.js"
        />
      </Field>
      <Field id="nice_to_have_csv" label="Nice-to-have (comma-separated)">
        <Input
          id="nice_to_have_csv"
          value={form.nice_to_have_csv}
          onChange={(e) => setForm({ ...form, nice_to_have_csv: e.target.value })}
          placeholder="Next.js, Supabase, Google Calendar API"
        />
      </Field>
      <Field id="body_markdown" label="JD body (markdown)">
        <Textarea
          id="body_markdown"
          rows={14}
          value={form.body_markdown}
          onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
          className="font-mono text-xs"
        />
      </Field>

      <div className="flex items-center justify-between border-t border-sand-100 pt-3">
        <div>
          {mode === "edit" && (
            <Button
              type="button"
              variant="outline"
              className="text-danger"
              onClick={onDelete}
              disabled={pending || deletePending}
            >
              {deletePending ? "Deleting…" : "Delete JD"}
            </Button>
          )}
        </div>
        <Button type="submit" disabled={pending || deletePending}>
          {pending ? "Saving…" : mode === "create" ? "Create JD" : "Save JD"}
        </Button>
      </div>
    </form>
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
