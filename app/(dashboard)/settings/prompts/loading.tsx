import { Skeleton, PageHeaderSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="space-y-3 rounded-lg border border-soft-gray bg-white p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
