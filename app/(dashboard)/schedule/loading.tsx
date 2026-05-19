import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="flex gap-1">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-[600px] w-full rounded-lg" />
    </div>
  );
}
