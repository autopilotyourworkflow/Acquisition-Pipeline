import { Suspense } from "react";
import { LoginForm } from "./login-form.client";

export const metadata = {
  title: "Sign in · Acquisition",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-none bg-yellow font-display text-2xl font-black text-black shadow-sm">
          H+
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-black">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-gray">
          Sign in to your recruiting workspace.
        </p>
      </div>
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-11 animate-pulse rounded-sm bg-off-white" />
      <div className="h-11 animate-pulse rounded-sm bg-off-white" />
    </div>
  );
}
