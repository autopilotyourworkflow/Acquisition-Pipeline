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
 * RFC 2047 "encoded-word" encoder for header values that contain non-ASCII
 * characters. RFC 2822 headers are defined as US-ASCII only; non-ASCII
 * bytes in a Subject or From header are undefined behavior and mail
 * clients typically display them as mojibake (the raw UTF-8 bytes get
 * misinterpreted as Latin-1, then re-decoded as UTF-8 = double-encoding).
 *
 * Format: `=?UTF-8?B?<base64 of UTF-8 bytes>?=`. ASCII-only values pass
 * through unchanged so the common case stays human-readable.
 *
 * Note: very long headers should technically be split into multiple
 * encoded-word chunks per RFC 2047 (max 75 chars per chunk). Subject
 * lines for our cold-email use case stay under 200 chars and Gmail
 * accepts a single long chunk in practice, so we don't bother splitting.
 */
function encodeMimeHeaderValue(value: string): string {
  const sanitized = sanitizeHeader(value);
  // ASCII-only? Pass through.
  if (/^[\x20-\x7E]*$/.test(sanitized)) return sanitized;
  const base64 = Buffer.from(sanitized, "utf8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

/**
 * Build a minimal multipart/alternative MIME message. The text part
 * comes first so any client that ignores the HTML still gets a readable
 * body — and the boundary is a random UUID-ish string so it can't
 * collide with anything inside either part.
 */
/**
 * Build the From header. Gmail's `me` placeholder rewrites to the authed
 * user's primary address, so we keep the angle-bracket part as-is and only
 * encode the display name. For ASCII display names, RFC 2822 quoted-string
 * form. For non-ASCII (Thai, etc.), RFC 2047 encoded-word for the display
 * name only — keeping `<me>` outside any encoded section so Gmail still
 * recognizes the substitution token.
 */
function buildFromHeader(fromName: string | null | undefined): string {
  if (!fromName) return "me";
  const trimmed = sanitizeHeader(fromName);
  if (trimmed.length === 0) return "me";
  if (/^[\x20-\x7E]*$/.test(trimmed)) {
    // ASCII: RFC 2822 quoted-string display name.
    return `"${trimmed.replace(/"/g, '\\"')}" <me>`;
  }
  // Non-ASCII: RFC 2047 encoded-word display name.
  const base64 = Buffer.from(trimmed, "utf8").toString("base64");
  return `=?UTF-8?B?${base64}?= <me>`;
}

function buildMime(args: {
  to: string;
  subject: string;
  fromHeader: string;
  bodyText: string;
  bodyHtml?: string;
}): string {
  // RFC 2047 encode any non-ASCII header values. Pass-through for ASCII so
  // simple English headers stay human-readable in the wire.
  const subject = encodeMimeHeaderValue(args.subject);
  const to = sanitizeHeader(args.to);
  // From was already assembled correctly by buildFromHeader above — pass
  // through without re-encoding (would otherwise double-encode the display
  // name or eat the `<me>` placeholder).
  const from = args.fromHeader;

  // Body parts get base64-encoded so non-ASCII UTF-8 (Thai, accents, etc.)
  // survives intermediary mail relays cleanly. 7bit was wrong for any body
  // with bytes > 0x7F; 8bit requires the relay to advertise 8BITMIME (most
  // do, but base64 is the safest default and Gmail forwards it without
  // touching). Lines are split to <=76 chars per the RFC.
  const textBase64 = chunkBase64(Buffer.from(args.bodyText, "utf8").toString("base64"));

  if (!args.bodyHtml) {
    return [
      `To: ${to}`,
      `Subject: ${subject}`,
      `From: ${from}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      textBase64,
    ].join("\r\n");
  }

  const htmlBase64 = chunkBase64(Buffer.from(args.bodyHtml, "utf8").toString("base64"));
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
    `Content-Transfer-Encoding: base64`,
    ``,
    textBase64,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlBase64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
}

/**
 * Split a base64 string into 76-char lines per RFC 2045 §6.8. Most mail
 * clients tolerate unwrapped base64 but the spec wants it wrapped and
 * some strict relays (Postfix with certain configs) reject otherwise.
 */
function chunkBase64(input: string): string {
  const out: string[] = [];
  for (let i = 0; i < input.length; i += 76) {
    out.push(input.slice(i, i + 76));
  }
  return out.join("\r\n");
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
  // their /profile here — Gmail rewrites the `me` placeholder to the user's
  // actual primary address, so an absent display name is safe (Gmail
  // substitutes the account's own).
  const fromHeader = buildFromHeader(input.fromName);

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
