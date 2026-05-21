"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveScoringPrompt } from "@/app/actions/prompts";

export function PromptEditor({
  initialText,
  activeVersion,
  disabled,
}: {
  initialText: string;
  activeVersion: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [pending, startTransition] = useTransition();

  const dirty = text !== initialText;

  function onSave() {
    if (!dirty) return;
    startTransition(async () => {
      const result = await saveScoringPrompt({ personaText: text });
      if (!result.ok) {
        toast.error("Couldn't save prompt", { description: result.error });
        return;
      }
      toast.success(`Saved as ${result.data.version}`, {
        description: "The next Run score will use this version.",
      });
      router.refresh();
    });
  }

  function onReset() {
    setText(initialText);
  }

  return (
    <div className="space-y-3 rounded-lg border border-soft-gray bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-black">Active version</p>
          <p className="font-mono text-[11px] text-black">{activeVersion}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={pending}
            >
              Reset
            </Button>
          )}
          <Button
            type="button"
            onClick={onSave}
            disabled={!dirty || pending || disabled}
          >
            {pending ? "Saving…" : dirty ? "Save as new version" : "No changes"}
          </Button>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={28}
        className="font-mono text-xs leading-relaxed"
        disabled={disabled}
      />
      <p className="text-[11px] text-gray">
        This text becomes Claude&apos;s system prompt at scoring time. Keep the
        instruction to output via the <code className="font-mono">submit_score</code>{" "}
        tool — without it the model may respond in free text and validation will fail.
      </p>
    </div>
  );
}
