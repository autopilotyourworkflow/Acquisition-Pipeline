import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-3 w-32" />
        <div className="mt-2 flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-60" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
