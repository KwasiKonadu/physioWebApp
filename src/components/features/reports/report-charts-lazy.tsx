"use client";
// Lazy wrappers so recharts only loads when a report tab with charts is actually shown.
// (next/dynamic options must be inline object literals.)
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const ReportDonut = dynamic(() => import("./ReportDonut").then((m) => m.ReportDonut), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-40 w-full" />,
});
export const ReportBarChart = dynamic(() => import("./ReportBarChart").then((m) => m.ReportBarChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-40 w-full" />,
});
