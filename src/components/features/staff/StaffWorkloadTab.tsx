"use client";
// Staff profile: workload tab.

import { labelize } from "@/lib/constants";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportBarChart } from "@/components/features/reports/ReportBarChart";
import { ReportDonut } from "@/components/features/reports/ReportDonut";
import { StaffDetail, StatsResponse, PERIODS, Period } from "./staff-profile-model";

export function StaffWorkloadTab({ data, stats, name, period, setPeriod, periodLabel, completionHint, noShowHint }: { data: StaffDetail; stats: StatsResponse | undefined; name: string; period: Period; setPeriod: (p: Period) => void; periodLabel: string; completionHint: string; noShowHint: string }) {
  return (
    <TabsContent value="workload" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Completed sessions only count towards workload.</p>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sessions" value={stats?.stats.completedSessions ?? 0} icon="Activity" tone="teal" hint={periodLabel} loading={!stats} />
        <StatCard label="Unique patients" value={stats?.stats.uniquePatients ?? 0} icon="Users" tone="sky" hint={periodLabel} loading={!stats} />
        <StatCard label="Active episodes" value={stats?.stats.activeEpisodes ?? 0} icon="GitBranch" tone="navy" loading={!stats} />
        <StatCard label="Appts completed" value={stats?.stats.appointmentsCompleted ?? 0} icon="CheckCircle2" tone="emerald" hint={completionHint} loading={!stats} />
        <StatCard label="No-shows" value={stats?.stats.noShows ?? 0} icon="UserX" tone="rose" hint={noShowHint} loading={!stats} />
        <StatCard label="Upcoming" value={stats?.stats.upcomingAppointments ?? 0} icon="Clock" tone="amber" loading={!stats} />
      </div>
      <SectionCard
        title="Activity — last 6 months"
        icon="BarChart3"
        description="Switch metrics on and off with the chips above the chart"
      >
        {!stats ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ReportBarChart
            data={stats.monthly}
            xKey="month"
            height={260}
            series={[
              { key: "sessions", name: "Sessions completed", color: "#7fa9ee" },
              { key: "patients", name: "Unique patients", color: "#306fdb" },
              { key: "booked", name: "Appointments booked", color: "#0ea5e9" },
              { key: "noShows", name: "No-shows", color: "#ef4444" },
              { key: "cancelled", name: "Cancelled", color: "#f59e0b" },
            ]}
            defaultHidden={["cancelled"]}
          />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Appointment outcomes" icon="PieChart" description={periodLabel}>
          {!stats ? (
            <Skeleton className="h-52 w-full" />
          ) : stats.statusBreakdown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No appointments in this period.</p>
          ) : (
            <ReportDonut
              data={stats.statusBreakdown.map((r) => ({ name: r.status, value: r.count }))}
              formatName={labelize}
              centreLabel="Appointments"
            />
          )}
        </SectionCard>
        <SectionCard title="Busiest days" icon="CalendarDays" description={`Completed sessions by weekday · ${periodLabel}`}>
          {!stats ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ReportBarChart
              data={stats.byWeekday}
              xKey="day"
              height={208}
              series={[{ key: "sessions", name: "Sessions", color: "#7fa9ee" }]}
            />
          )}
        </SectionCard>
      </div>
    </TabsContent>
  );
}
