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
      const session = data.session as any;
      const providerToken: string | null | undefined = session.provider_token;
      const providerRefreshToken: string | null | undefined = session.provider_refresh_token;

      console.log("[auth/callback] user.id:", data.session.user.id);
      console.log("[auth/callback] provider_token present:", !!providerToken);
      console.log("[auth/callback] provider_refresh_token present:", !!providerRefreshToken);
      console.log(
        "[auth/callback] env: OAUTH_ENCRYPTION_SECRET set =",
        !!process.env.OAUTH_ENCRYPTION_SECRET,
        "len =",
        process.env.OAUTH_ENCRYPTION_SECRET?.length,
      );
      console.log(
        "[auth/callback] env: SUPABASE_SERVICE_ROLE_KEY set =",
        !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      );

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
        console.log("[auth/callback] upsertOAuthTokens succeeded");
      } else {
        console.warn(
          "[auth/callback] Skipping OAuth token upsert — Supabase did not return provider tokens.",
        );
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
