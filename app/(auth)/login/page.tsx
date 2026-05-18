import { Suspense } from "react";
import { LoginForm } from "./login-form.client";

export const metadata = {
  title: "Sign in · Acquisition",
};

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-medium text-navy">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-charcoal">
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
      <div className="h-11 animate-pulse rounded-md bg-sand-100" />
      <div className="h-11 animate-pulse rounded-md bg-sand-100" />
    </div>
  );
}
