"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveEmailSignature } from "@/app/actions/emails";

/**
 * Signature + from-name editor for cold emails. Unlike the API-key panel,
 * these are NOT secrets — we echo the saved values back into the form so
 * the user can tweak rather than re-type from scratch. Stored plaintext
 * in user_settings (text columns, no encryption).
 */
type Props = {
  initialSignature: string | null;
  initialFromName: string | null;
};

export function EmailDefaultsPanel({
  initialSignature,
  initialFromName,
}: Props) {
  const router = useRouter();
  const [signature, setSignature] = useState(initialSignature ?? "");
  const [fromName, setFromName] = useState(initialFromName ?? "");
  const [pending, startTransition] = useTransition();

  const hasSavedSignature = (initialSignature ?? "").trim().length > 0;
  const hasSavedFromName = (initialFromName ?? "").trim().length > 0;

  function submit() {
    startTransition(async () => {
      const r = await saveEmailSignature({
        signature,
        fromName,
      });
      if (!r.ok) {
        toast.error("Couldn't save", { description: r.error });
        return;
      }
      toast.success("Email defaults saved");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl text-navy">Email defaults</h2>
        <p className="mt-1 text-sm text-charcoal">
          Used by the &quot;Draft cold email&quot; button on candidate pages. Your
          signature is appended automatically when a draft is sent. Gmail
          uses your account&apos;s real email as the sender — the From name
          here just controls the display name recipients see.
        </p>
      </div>

      <div className="rounded-md border border-sand-200 bg-warm-white px-4 py-3 space-y-4">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
            From name
          </label>
          <Input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="e.g. Hotel Plus Recruiting"
            disabled={pending}
            maxLength={120}
          />
          <p className="mt-1 text-[11px] text-slate-mid">
            Shown in the recipient&apos;s inbox as the sender name. Leave blank
            to use whatever name Gmail has for your account.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
            Signature
          </label>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={
              "Best regards,\nYour Name\nHotel Plus Recruiting\nhotelplus.asia"
            }
            disabled={pending}
            rows={6}
            maxLength={1500}
            className="font-sans text-sm leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-slate-mid">
            Plain text. Appended to the body of every cold email send, with
            two blank lines above it. Drafts shown in the dialog don&apos;t
            include the signature — it&apos;s added at send time.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-mid">
            {hasSavedSignature || hasSavedFromName ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 font-medium text-success">
                <span aria-hidden>✓</span> Saved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-sand-200/40 px-2 py-1 font-medium text-slate-deep">
                Not configured
              </span>
            )}
          </div>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save defaults"}
          </Button>
        </div>
      </div>
    </section>
  );
}
