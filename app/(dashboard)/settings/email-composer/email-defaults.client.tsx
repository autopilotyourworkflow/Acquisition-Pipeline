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

/**
 * Hotel Plus's canonical email signature (text rendering — no logo). Used
 * as a one-click preset so the user doesn't have to retype it. The job
 * title ("Career Opportunity Manager") is per-person; the rest is the
 * company block.
 */
const HOTEL_PLUS_SIGNATURE_PRESET = `Best regards,
Career Opportunity Manager

HOTEL PLUS
Hospitality Management | Online Revenue Management
062-659-9604
career@hotelplus.asia
www.hotelplus.asia
92/5 fl.2 unit 208, Sathon Thani 2 Bld, North Sathon Road, Bangkok 10500`;

const HOTEL_PLUS_FROM_NAME_PRESET = "Hotel Plus Recruiting";

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
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="block text-[11px] uppercase tracking-wide text-slate-deep">
              Signature
            </label>
            <button
              type="button"
              onClick={() => {
                setSignature(HOTEL_PLUS_SIGNATURE_PRESET);
                if (!fromName.trim()) setFromName(HOTEL_PLUS_FROM_NAME_PRESET);
              }}
              disabled={pending}
              className="text-[11px] text-terracotta-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Insert Hotel Plus default →
            </button>
          </div>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={
              "Best regards,\nYour Name\nHotel Plus Recruiting\nhotelplus.asia"
            }
            disabled={pending}
            rows={8}
            maxLength={1500}
            className="font-sans text-sm leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-slate-mid">
            Plain text. Appended to the body of every cold email send, with
            two blank lines above it. The &quot;Insert Hotel Plus default&quot;
            button populates the company block — edit the job title to match
            yours.
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
