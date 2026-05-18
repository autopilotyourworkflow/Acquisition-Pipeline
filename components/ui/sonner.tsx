"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Sonner toast container — drop into the dashboard layout once. Toasts fire
 * via `import { toast } from "sonner"` anywhere in the tree.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "border-sand-200 bg-warm-white text-navy font-sans rounded-md shadow-md",
          description: "text-charcoal",
          actionButton: "bg-terracotta text-cream",
          cancelButton: "bg-sand-100 text-charcoal",
        },
      }}
    />
  );
}
