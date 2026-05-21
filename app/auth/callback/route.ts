import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertOAuthTokens } from "@/lib/google/oauth";

/**
 * Supabase OAuth callback handler. Exchanges the `?code` from the
 * provider for an authenticated session, then redirects to `?next`
 * (or /tracker by default).
 *
 * If the provider is Google and includes OAuth scopes, captures the
 * provider tokens and persists them to oauth_tokens table (encrypted).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/tracker";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (data.session?.user?.id) {
    try {
      // supabase-js's Session type doesn't expose `provider_token` /
      // `provider_refresh_token` (they're populated on the OAuth callback
      // only). Cast to the narrower shape we actually need.
      const session = data.session as typeof data.session & {
        provider_token?: string | null;
        provider_refresh_token?: string | null;
      };
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;

      if (providerToken && providerRefreshToken) {
        const GOOGLE_SCOPES = [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.freebusy",
          "https://www.googleapis.com/auth/gmail.compose",
          "https://www.googleapis.com/auth/gmail.send",
        ];

        await upsertOAuthTokens({
          userId: data.session.user.id,
          provider: "google",
          accessToken: providerToken,
          refreshToken: providerRefreshToken,
          expiresIn: 3600,
          scopes: GOOGLE_SCOPES,
        });
      } else {
        // Email-OTP signin or a Google flow that didn't request offline
        // access — fine, the user just can't use Calendar/Gmail features
        // until they connect from /settings/integrations.
      }
    } catch (err) {
      console.error(
        "[auth/callback] Failed to persist OAuth tokens:",
        err instanceof Error ? err.stack || err.message : err,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
