"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";

// Route-level error boundary: a crash in one page shows this inside the shell instead of a blank screen.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <EmptyState
      icon="AlertCircle"
      title="Something went wrong on this page"
      description="The rest of the app is still working. Try again, or go back to the dashboard."
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => { router.push("/dashboard"); reset(); }}>Dashboard</Button>
        </div>
      }
    />
  );
}
