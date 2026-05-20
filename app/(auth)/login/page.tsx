import { Suspense } from "react";
import { LoginForm } from "./login-form.client";

export const metadata = {
  title: "Sign in · Acquisition Pipeline",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-black">
          Welcome back
        </h1>
        <p className="mt-3 text-sm text-gray">
          Sign in to your recruiting workspace.
        </p>
      </div>
      <div className="rounded-lg border border-soft-gray bg-white p-8 shadow-sm">
        <Suspense fallback={<LoginSkeleton />}>
          <LoginForm />
        </Suspense>
      </div>
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
