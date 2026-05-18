export default function ScraperLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-200" />
      </div>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex gap-2 border-b border-gray-200 pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-24 animate-pulse rounded bg-gray-200" />
          ))}
        </div>

        <div className="space-y-4">
          <div className="h-64 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
