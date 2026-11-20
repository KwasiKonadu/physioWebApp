import { Skeleton } from "@/components/ui/skeleton";

// Shown inside the app shell while a route's code is loading (the shell itself stays put).
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
