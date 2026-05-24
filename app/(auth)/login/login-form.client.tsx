"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Step = "method" | "code-sent";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/tracker";

  const [step, setStep] = useState<Step>("method");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleGoogle() {
    setPending(true);
    setError(null);
    // Bundle Calendar + Gmail scopes upfront. We're a recruiting tool —
    // 100% of users will want these eventually, so making them grant once
    // beats sending them back to /settings/integrations later.
    //
    // access_type=offline + prompt=consent forces Google to issue a
    // refresh_token (otherwise we'd lose API access after ~1h). The token
    // storage + use happens in the Day-3 Scheduler/Email modules.
    const SCOPES = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" ");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: SCOPES,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code-sent");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleGuest() {
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (step === "code-sent") {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div className="rounded-sm border border-soft-gray bg-off-white px-4 py-3 text-sm text-gray">
          We sent a sign-in code to{" "}
          <span className="font-semibold text-black">{email}</span>.
        </div>
        <div>
          <label
            htmlFor="code"
            className="block text-xs font-semibold uppercase tracking-wider text-black"
          >
            Verification code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6,8}"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoFocus
            className="mt-1.5 h-11 w-full rounded-sm border border-soft-gray bg-white px-3 font-mono text-base tracking-[0.4em] text-black placeholder:text-gray-dim focus:border-black focus:outline-none"
          />
        </div>
        {error && <FormError message={error} />}
        <button
          type="submit"
          disabled={pending || code.length < 6 || code.length > 8}
          className="inline-flex h-11 w-full items-center justify-center rounded-sm bg-yellow px-6 text-sm font-semibold text-black transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-soft-gray disabled:text-gray"
        >
          {pending ? "Verifying…" : "Continue"}
        </button>
        <p className="text-center text-[11px] text-gray">
          Or click the sign-in link in your email — both paths work.
        </p>
        <button
          type="button"
          onClick={() => {
            setStep("method");
            setCode("");
            setError(null);
          }}
          className="block w-full text-center text-xs text-black underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-sm border border-soft-gray bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-off-white disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-soft-gray" />
        <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray">
          or
        </span>
        <div className="flex-1 border-t border-soft-gray" />
      </div>

      <form onSubmit={handleSendCode} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-black"
          >
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1.5 h-11 w-full rounded-sm border border-soft-gray bg-white px-3 text-sm text-black placeholder:text-gray-dim focus:border-black focus:outline-none"
          />
        </div>
        {error && <FormError message={error} />}
        <button
          type="submit"
          disabled={pending || !email}
          className="inline-flex h-11 w-full items-center justify-center rounded-sm bg-yellow px-6 text-sm font-semibold text-black transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-soft-gray disabled:text-gray"
        >
          {pending ? "Sending…" : "Email me a sign-in code"}
        </button>
      </form>

      <div className="border-t border-soft-gray pt-5">
        <button
          type="button"
          onClick={handleGuest}
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center rounded-sm border border-black bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-black hover:text-yellow disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Continue as guest"}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray">
          Reviewer demo path. Calendar &amp; email features need Google sign-in.
        </p>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
      {message}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.708V4.96H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
