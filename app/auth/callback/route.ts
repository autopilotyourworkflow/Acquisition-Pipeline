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
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Capture Google OAuth tokens if present
  if (data.session?.user?.id) {
    try {
      // Cast to any to access potentially available provider fields
      // These are populated by Supabase when OAuth scopes include offline access
      const session = data.session as any;
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;

      // Only persist if we have a refresh token (offline scope granted)
      if (providerToken && providerRefreshToken) {
        // The scopes are the ones we requested in login-form.client.tsx
        // Supabase passes them through, or we can hardcode them since they're fixed
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
          expiresIn: 3600, // Google access tokens valid for 1 hour
          scopes: GOOGLE_SCOPES,
        });
      }
    } catch (err) {
      // Log the error but don't fail the entire signin flow
      console.error("Failed to persist OAuth tokens:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
