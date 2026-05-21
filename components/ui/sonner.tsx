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
            "border-soft-gray bg-white text-black font-sans rounded-md shadow-md",
          description: "text-black",
          actionButton: "bg-yellow text-black",
          cancelButton: "bg-off-white text-black",
        },
      }}
    />
  );
}
