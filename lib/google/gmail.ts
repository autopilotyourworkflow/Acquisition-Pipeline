import { getGoogleAccessToken } from "@/lib/google/oauth";

/**
 * Gmail SDK wrapper — Phase 3e.
 *
 * Sends an email on behalf of the connected user via the Gmail REST API.
 * Uses the user's OAuth access token (refreshed if needed) plus the
 * `gmail.send` scope. If the user hasn't granted that scope yet, the
 * call fails fast with a typed error so the UI can prompt them to
 * re-consent.
 *
 * Why we hand-roll MIME instead of using googleapis:
 *  - googleapis is huge and we only need one endpoint here.
 *  - The native fetch + Buffer path stays consistent with how the rest
 *    of the project talks to Google (calendar.ts and oauth.ts also
 *    use raw fetch).
 *  - Gmail's send endpoint takes a single base64url-encoded RFC2822
 *    blob — that's straightforward to build.
 */

export class GmailSendError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "not_connected"
      | "missing_scope"
      | "revoked"
      | "api_error"
      | "network",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GmailSendError";
  }
}

export type SendEmailInput = {
  userId: string;
  to: string;
  subject: string;
  /** Plain-text body (newline-delimited). Always sent as the text/plain part. */
  bodyText: string;
  /** HTML rendering of the body. If omitted, falls back to text/plain only. */
  bodyHtml?: string;
  /** Display name for the From header (Gmail still uses the authed user's email). */
  fromName?: string | null;
};

export type SendEmailResult = {
  messageId: string;
  threadId: string;
};

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * RFC 2822 base64url encoder — Gmail's send endpoint requires the message
 * to be base64url-encoded (URL-safe alphabet, no padding). Standard
 * Buffer.toString("base64") doesn't apply the URL-safe substitutions,
 * so we patch them here.
 */
function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Header values must avoid CR/LF injection (an attacker-supplied subject
 * could otherwise smuggle a Bcc header). Gmail's API would reject the
 * smuggle, but cleaning at the boundary is the right discipline. Strip
 * CR/LF from any field that becomes a header.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Build a minimal multipart/alternative MIME message. The text part
 * comes first so any client that ignores the HTML still gets a readable
 * body — and the boundary is a random UUID-ish string so it can't
 * collide with anything inside either part.
 */
function buildMime(args: {
  to: string;
  subject: string;
  fromHeader: string;
  bodyText: string;
  bodyHtml?: string;
}): string {
  const subject = sanitizeHeader(args.subject);
  const to = sanitizeHeader(args.to);
  const from = sanitizeHeader(args.fromHeader);

  if (!args.bodyHtml) {
    // Plain text only — simpler MIME, no multipart wrapper.
    return [
      `To: ${to}`,
      `Subject: ${subject}`,
      `From: ${from}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      args.bodyText,
    ].join("\r\n");
  }

  const boundary = `=_HotelPlus_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  return [
    `To: ${to}`,
    `Subject: ${subject}`,
    `From: ${from}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    args.bodyText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    args.bodyHtml,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
}

/**
 * Lightweight markdown → HTML for the email body. Cold emails don't need
 * anything fancy — we want paragraph breaks and the occasional bold or
 * link. Anything heavier should be rendered by a real markdown library;
 * this is intentionally tiny to avoid pulling another dep into the bundle.
 *
 * Escapes HTML first, then applies a handful of inline replacements.
 */
export function markdownToEmailHtml(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withInline = escaped
    // **bold**
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    // *italic*
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    // [text](url) — only http(s) targets to avoid javascript: smuggling
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2">$1</a>',
    );

  // Paragraphs: split on blank lines. Single newlines inside a paragraph
  // become <br/> so the recruiter's manual line breaks survive.
  const paragraphs = withInline
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;line-height:1.5;color:#17202E;">${paragraphs}</body></html>`;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const tokenResult = await getGoogleAccessToken(input.userId);
  if (!tokenResult.ok) {
    if (tokenResult.reason === "not_connected") {
      throw new GmailSendError(
        "No Google account connected. Sign in with Google to grant Gmail Send.",
        "not_connected",
      );
    }
    if (tokenResult.reason === "revoked") {
      throw new GmailSendError(
        "Google token was revoked. Sign in with Google again to re-grant Gmail Send.",
        "revoked",
      );
    }
    throw new GmailSendError(
      `Couldn't get Google access token: ${tokenResult.message ?? "unknown error"}`,
      "api_error",
    );
  }

  // The authed user's Gmail address goes in the From header. We don't fetch
  // their /profile here — Gmail will use the authenticated identity
  // regardless of what we put in the From header, so an absent display
  // name is safe (Gmail substitutes the account's own).
  const fromHeader = input.fromName
    ? `${sanitizeHeader(input.fromName)} <me>`
    : `me`;
  // "me" is Gmail's well-known alias for the authenticated user — when used
  // in the From header, Gmail rewrites it to the user's actual primary
  // address. This keeps us from needing to fetch the user's email up front.

  const mime = buildMime({
    to: input.to,
    subject: input.subject,
    fromHeader,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
  });

  const encoded = base64UrlEncode(mime);

  let resp: Response;
  try {
    resp = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    });
  } catch (err) {
    throw new GmailSendError(
      `Network error sending Gmail: ${err instanceof Error ? err.message : "unknown"}`,
      "network",
    );
  }

  if (!resp.ok) {
    const errBody = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> };
    };
    const message = errBody.error?.message ?? `Gmail API returned ${resp.status}`;
    // 403 + 'insufficientPermissions' / 'PERMISSION_DENIED' indicates the
    // user hasn't granted gmail.send. Give the UI a clean reason so it can
    // route them to /settings/integrations.
    const reasons = errBody.error?.errors?.map((e) => e.reason) ?? [];
    const isScopeError =
      resp.status === 403 ||
      reasons.some((r) => r === "insufficientPermissions" || r === "forbidden");
    throw new GmailSendError(
      message,
      isScopeError ? "missing_scope" : "api_error",
      resp.status,
    );
  }

  const result = (await resp.json()) as { id?: string; threadId?: string };
  if (!result.id || !result.threadId) {
    throw new GmailSendError(
      "Gmail API returned 200 but no message id — unexpected shape.",
      "api_error",
    );
  }

  return { messageId: result.id, threadId: result.threadId };
}
