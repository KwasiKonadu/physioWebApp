"use client";
// Dashboard Middle column: revenue mix, appointment status and items needing attention.

import { formatMoney, minutesToTime, formatDate } from "@/lib/format";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import { Donut, StatusBars } from "./dashboard-charts-lazy";
import { useUIStore } from "@/stores/app-store";
import type { DashboardData } from "./dashboard-types";
import { EmptyStateCompact } from "./DashboardParts";

export function DashboardMiddleColumn({ windowLabel, mix, mixTotal, m, data, isLoading }: { windowLabel: string; mix: { name: string; value: number; color: string }[]; mixTotal: number; m: DashboardData["metrics"] | undefined; data: DashboardData | undefined; isLoading: boolean }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Revenue mix" icon="PieChart" description="Selected period" loading={isLoading}>
          <Donut slices={mix} centre={m ? formatMoney(m.revenueCollectedCents) : "—"} sub="collected" />
          <div className="mt-3 space-y-1.5">
            {mix.map((x) => (
              <div key={x.name} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />
                <span className="text-slate-600">{x.name}</span>
                <span className="ml-auto font-semibold">{formatMoney(x.value)}</span>
                <span className="w-9 text-right text-xs text-muted-foreground">{Math.round((x.value / mixTotal) * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-rose-700">Outstanding balance</p>
              <p className="text-sm font-bold text-rose-800">{m ? formatMoney(m.outstandingAmountCents) : "—"}</p>
            </div>
            <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-100" onClick={() => navigate("billing", { focusTab: "invoices" })}>
              Review
            </Button>
          </div>
        </SectionCard>

      <SectionCard title="Appointment status" icon="ListChecks" description={windowLabel} loading={isLoading}>
          {(data?.charts.appointmentStatus || []).length === 0 ? (
            <EmptyState icon="CalendarX" title="No appointments" description="Nothing booked in this window." />
          ) : (
            <StatusBars rows={data?.charts.appointmentStatus || []} />
          )}
        </SectionCard>

      <SectionCard title="Needs attention" icon="BellRing" loading={isLoading} className="flex-1">
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Progress reviews due</p>
              {(data?.reviewsDue || []).length === 0 ? (
                <EmptyStateCompact title="All caught up — no reviews due" />
              ) : (
                (data?.reviewsDue || []).map((r) => (
                  <button key={r.id} type="button" className="w-full rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-left hover:bg-amber-50" onClick={() => navigate("progress-reviews", { episodeId: r.id })}>
                    <p className="truncate text-sm font-medium">{r.patientName}</p>
                    <p className="text-xs text-muted-foreground">{r.sessionsSinceReview}/{r.threshold} sessions · {r.therapist}</p>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="label-caps">Coming up</p>
              {(data?.upcomingAppointments || []).length === 0 ? (
                <EmptyStateCompact title="No upcoming appointments" />
              ) : (
                (data?.upcomingAppointments || []).slice(0, 4).map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs">
                    <span className="truncate font-medium">{u.patientName}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDate(u.date, { month: "short", day: "numeric" })} · {minutesToTime(u.time)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>
    </div>
  );
}
