"use client";
// Lazy wrappers: recharts (~100KB+) loads after the stat cards and lists have rendered, not before.
// (next/dynamic options must be inline object literals.)
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RevenueAreaChart = dynamic(() => import("./DashboardCharts").then((m) => m.RevenueAreaChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-32 w-full" />,
});
export const ActivityAreaChart = dynamic(() => import("./DashboardCharts").then((m) => m.ActivityAreaChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-32 w-full" />,
});
export const Donut = dynamic(() => import("./DashboardCharts").then((m) => m.Donut), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-32 w-full" />,
});
export const StatusBars = dynamic(() => import("./DashboardCharts").then((m) => m.StatusBars), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-32 w-full" />,
});
