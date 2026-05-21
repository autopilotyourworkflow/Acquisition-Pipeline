"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveEmailSignature } from "@/app/actions/emails";
import { looksLikeHtml } from "@/lib/google/gmail";

/**
 * Signature + from-name editor for cold emails. Unlike the API-key panel,
 * these are NOT secrets — we echo the saved values back into the form so
 * the user can tweak rather than re-type from scratch. Stored plaintext
 * in user_settings.
 *
 * The signature field accepts EITHER plain text or HTML. The send path
 * auto-detects which (via `looksLikeHtml`) and renders accordingly:
 *   - Plain text → escaped and wrapped in <pre> for the HTML body part;
 *     used verbatim for the plain text body part.
 *   - HTML → used verbatim for the HTML body part; tag-stripped for
 *     the plain text body part.
 *
 * The "Insert Hotel Plus default" button drops in a hand-tuned HTML
 * signature that visually approximates the real Hotel Plus signature
 * (yellow H+ logo block + orange divider + linked contact info).
 */
type Props = {
  initialSignature: string | null;
  initialFromName: string | null;
};

/**
 * Hotel Plus's canonical signature, hand-built as HTML to match the real
 * Gmail signature design. Uses table layout (not flexbox) for Outlook +
 * older webmail compatibility. All styles inline because most clients
 * strip <style> tags.
 *
 * Images are hotlinked from imageshack (the same hosting the user's
 * original Gmail signature uses):
 *   - LOGO_URL: the yellow H+ square with "HOTEL PLUS" caption
 *   - BANNER_URL: the marketing banner with the tagline
 *
 * `border="0"` HTML attribute plus inline `border:0` style — Outlook
 * adds a default border to <img> in a link context otherwise.
 * `display:block` on images prevents the usual descender-induced gap
 * below them in table cells.
 */
const HOTEL_PLUS_LOGO_URL = "https://imagizer.imageshack.com/img924/2620/KKfUsC.jpg";
const HOTEL_PLUS_BANNER_URL = "https://imagizer.imageshack.com/img924/9907/VcUSS0.png";

const HOTEL_PLUS_SIGNATURE_PRESET = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#17202E;border-collapse:collapse;">
  <tr>
    <td valign="top" style="padding-right:20px;width:120px;">
      <img src="${HOTEL_PLUS_LOGO_URL}" alt="Hotel Plus" width="110" border="0" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
    </td>
    <td valign="top" style="padding-left:4px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;line-height:1.1;color:#17202E;letter-spacing:0.5px;">HOTEL PLUS</div>
      <div style="margin-top:6px;font-size:14px;color:#17202E;">Career Opportunity Manager</div>
      <div style="margin-top:2px;font-size:12px;color:#6B7280;">Hospitality Management | Online Revenue Management</div>
      <div style="margin-top:10px;height:2px;width:120px;background:#F5A524;line-height:0;font-size:0;">&nbsp;</div>
      <div style="margin-top:10px;font-size:13px;color:#17202E;">062-659-9604</div>
      <div style="font-size:13px;"><a href="mailto:career@hotelplus.asia" style="color:#1A73E8;text-decoration:none;">career@hotelplus.asia</a></div>
      <div style="font-size:13px;"><a href="https://www.hotelplus.asia" style="color:#1A73E8;text-decoration:none;">www.hotelplus.asia</a></div>
      <div style="margin-top:6px;font-size:11px;color:#6B7280;line-height:1.4;">92/5 fl.2 unit 208, Sathon Thani 2 Bld<br/>North Sathon Road, Bangkok 10500</div>
    </td>
  </tr>
</table>
<div style="margin-top:18px;">
  <a href="https://www.hotelplus.asia" style="text-decoration:none;border:0;outline:none;">
    <img src="${HOTEL_PLUS_BANNER_URL}" alt="Hotel Plus — Increase revenue, reduce operating costs" width="600" border="0" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;" />
  </a>
</div>`;

const HOTEL_PLUS_FROM_NAME_PRESET = "Hotel Plus Recruiting";

export function EmailDefaultsPanel({
  initialSignature,
  initialFromName,
}: Props) {
  const router = useRouter();
  const [signature, setSignature] = useState(initialSignature ?? "");
  const [fromName, setFromName] = useState(initialFromName ?? "");
  const [pending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(true);

  const hasSavedSignature = (initialSignature ?? "").trim().length > 0;
  const hasSavedFromName = (initialFromName ?? "").trim().length > 0;
  const signatureIsHtml = signature.trim().length > 0 && looksLikeHtml(signature);

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
        <h2 className="font-display text-xl text-black">Email defaults</h2>
        <p className="mt-1 text-sm text-black">
          Used by the &quot;Draft cold email&quot; button on candidate pages.
          Your signature is appended automatically when a draft is sent.
          Gmail uses your account&apos;s real email as the sender — the From
          name here just controls the display name recipients see.
        </p>
      </div>

      <div className="space-y-4 rounded-md border border-soft-gray bg-white px-4 py-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black">
            From name
          </label>
          <Input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="e.g. Hotel Plus Recruiting"
            disabled={pending}
            maxLength={120}
          />
          <p className="mt-1 text-[11px] text-gray">
            Shown in the recipient&apos;s inbox as the sender name. Leave blank
            to use whatever name Gmail has for your account.
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="block text-[11px] uppercase tracking-wide text-black">
              Signature{" "}
              {signatureIsHtml && (
                <span className="rounded-sm bg-info/10 px-1 py-0.5 font-mono text-[9px] text-info">
                  HTML
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                setSignature(HOTEL_PLUS_SIGNATURE_PRESET);
                if (!fromName.trim()) setFromName(HOTEL_PLUS_FROM_NAME_PRESET);
              }}
              disabled={pending}
              className="text-[11px] text-black underline-offset-2 hover:underline disabled:opacity-50"
            >
              Insert Hotel Plus default →
            </button>
          </div>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={"Best regards,\nYour Name\nHotel Plus Recruiting\nhotelplus.asia"}
            disabled={pending}
            rows={signatureIsHtml ? 12 : 8}
            maxLength={6000}
            className="font-mono text-xs leading-relaxed"
          />
          <p className="mt-1 text-[11px] text-gray">
            Accepts plain text OR HTML. The &quot;Insert Hotel Plus
            default&quot; preset is HTML — gives you the H+ logo block + orange
            divider + linked contact info. Plain text also works (newlines
            preserved); the send path picks the right rendering automatically.
          </p>
        </div>

        {signatureIsHtml && (
          <div className="rounded-md border border-soft-gray bg-white/40">
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="flex w-full items-center justify-between border-b border-soft-gray px-3 py-2 text-left text-[11px] uppercase tracking-wide text-black hover:bg-white/60"
            >
              <span>Preview</span>
              <span>{previewOpen ? "Hide ▴" : "Show ▾"}</span>
            </button>
            {previewOpen && (
              <div className="bg-white p-4">
                <div
                  // Trusted: this is the user's own saved HTML being
                  // rendered back to them in their own browser. No
                  // third-party content here.
                  dangerouslySetInnerHTML={{ __html: signature }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-gray">
            {hasSavedSignature || hasSavedFromName ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 font-medium text-success">
                <span aria-hidden>✓</span> Saved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-soft-gray/40 px-2 py-1 font-medium text-black">
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
