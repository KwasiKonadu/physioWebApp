"use client";
// Dashboard Left column: revenue, activity trend and active episodes.

import { formatDate } from "@/lib/format";
import { SectionCard } from "@/components/molecules/section-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ActivityAreaChart, RevenueAreaChart, VIZ, type TrendPoint } from "./DashboardCharts";
import { APP } from "@/lib/constants";
import { useUIStore } from "@/stores/app-store";
import type { DashboardData } from "./dashboard-types";
import { EmptyStateCompact } from "./DashboardParts";

export function DashboardLeftColumn({ windowLabel, windowRevenue, avgRevenue, totalAppts, totalSessions, totalNewPatients, trend, data, isLoading }: { windowLabel: string; windowRevenue: number; avgRevenue: number; totalAppts: number; totalSessions: number; totalNewPatients: number; trend: TrendPoint[]; data: DashboardData | undefined; isLoading: boolean }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Revenue" icon="LineChart" description={windowLabel} loading={isLoading}
          actions={<Button variant="outline" size="sm" onClick={() => navigate("billing")}>Billing</Button>}>
          <div className="mb-2 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <p className="text-2xl font-bold leading-tight text-navy-800">{APP.currencySymbol}{windowRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Collected · {windowLabel.toLowerCase()}</p>
            </div>
            <div>
              <p className="text-lg font-semibold leading-tight text-slate-700">{APP.currencySymbol}{avgRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Daily average</p>
            </div>
          </div>
          <div className="h-44"><RevenueAreaChart data={trend} symbol={APP.currencySymbol} /></div>
        </SectionCard>

      <SectionCard title="Appointments & sessions" icon="Activity" description={windowLabel} loading={isLoading}>
          <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded" style={{ background: VIZ.blue }} />Appointments <b className="text-slate-800">{totalAppts}</b></span>
            <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded" style={{ background: VIZ.teal }} />Sessions completed <b className="text-slate-800">{totalSessions}</b></span>
            <span className="flex items-center gap-2 text-muted-foreground">New patients <b className="text-slate-800">{totalNewPatients}</b></span>
          </div>
          <div className="h-40"><ActivityAreaChart data={trend} /></div>
        </SectionCard>

      <SectionCard title="Active treatment episodes" icon="Stethoscope" loading={isLoading} className="flex-1"
          actions={<Button variant="outline" size="sm" onClick={() => navigate("patients")}>Patient directory</Button>}>
          {(data?.activeEpisodesList || []).length === 0 ? (
            <EmptyStateCompact title="No active episodes" />
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {(data?.activeEpisodesList || []).slice(0, 6).map((e) => (
                <button key={e.id} type="button" className="rounded-lg border p-2.5 text-left transition-colors hover:border-teal-500 hover:bg-teal-50/40" onClick={() => navigate("patients", { patientId: e.patientId })}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{e.patientName}</p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{e.title} · {e.therapist}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Progress value={Math.min(100, (e.sinceReview / e.threshold) * 100)} className="h-1.5" />
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{e.sinceReview}/{e.threshold} to review</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {(data?.recentlyDischarged || []).length > 0 && (
            <div className="mt-3 border-t pt-2.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently discharged</p>
              <div className="flex flex-wrap gap-2">
                {(data?.recentlyDischarged || []).map((d) => (
                  <span key={d.id} className="rounded-full border bg-slate-50 px-3 py-1 text-xs">
                    <span className="font-medium">{d.patientName}</span>
                    <span className="ml-1.5 text-muted-foreground">{d.closedDate ? formatDate(d.closedDate) : "—"}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
    </div>
  );
}
