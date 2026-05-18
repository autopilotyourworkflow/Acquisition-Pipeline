"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Step = "method" | "sent";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/tracker";

  const [step, setStep] = useState<Step>("method");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleGoogle() {
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
    // On success the browser is redirected; nothing else to manage.
  }

  async function handleSendLink(e: React.FormEvent) {
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
    setStep("sent");
  }

  if (step === "sent") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-success/30 bg-success/5 p-5">
          <p className="font-display text-lg text-navy">Check your email</p>
          <p className="mt-1.5 text-sm text-charcoal">
            We sent a sign-in link to{" "}
            <span className="font-medium text-navy">{email}</span>.
          </p>
          <p className="mt-3 text-xs text-slate-deep">
            Click the link in the email to finish signing in. It expires in 1 hour.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStep("method");
            setError(null);
          }}
          className="block w-full text-center text-xs text-slate-deep underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-sand-200 bg-warm-white px-4 text-sm font-medium text-navy transition-colors hover:bg-sand-100 disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-sand-200" />
        <span className="px-3 text-[11px] font-medium uppercase tracking-widest text-slate-mid">
          or
        </span>
        <div className="flex-1 border-t border-sand-200" />
      </div>

      <form onSubmit={handleSendLink} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium uppercase tracking-wider text-slate-deep"
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
            className="mt-1.5 h-11 w-full rounded-md border border-sand-200 bg-warm-white px-3 text-sm text-navy placeholder:text-slate-mid focus:border-terracotta focus:outline-none"
          />
        </div>
        {error && <FormError message={error} />}
        <button
          type="submit"
          disabled={pending || !email}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-navy px-6 text-sm font-medium text-cream shadow-xs transition-colors hover:bg-navy-soft disabled:opacity-50"
        >
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      <p className="text-center text-[11px] text-slate-mid">
        New here? You&apos;ll need an invitation from an existing teammate.
      </p>
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
