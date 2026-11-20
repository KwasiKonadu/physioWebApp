"use client";
// Reports: appointments report tab.

import { labelize } from "@/lib/constants";
import { ReportDonut } from "./report-charts-lazy";
import { ReportBarChart } from "./report-charts-lazy";
import { DataTable } from "@/components/molecules/data-table";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { AppointmentsReport } from "./report-types";
import { TEAL, NAVY } from "./report-utils";

export function AppointmentsTab({ report, prev, prevLabel }: { report: AppointmentsReport; prev?: AppointmentsReport; prevLabel: string }) {
  const s = report.stats;
  const total = s.total || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total appointments" value={s.total} icon="CalendarDays" tone="navy" trend={makeTrend(s.total, prev?.stats.total, {neutral: true, title: `vs ${prevLabel}`})} />
        <StatCard label="Completed" value={s.completed} icon="CheckCircle2" tone="emerald" hint={`${Math.round((s.completed / total) * 100)}%`} trend={makeTrend(s.completed, prev?.stats.completed, { title: `vs ${prevLabel}` })} />
        <StatCard label="Cancelled" value={s.cancelled} icon="XCircle" tone="sky" trend={makeTrend(s.cancelled, prev?.stats.cancelled, {lowerIsBetter: true, title: `vs ${prevLabel}`})} />
        <StatCard label="No-shows" value={s.noShows} icon="UserX" tone="rose" trend={makeTrend(s.noShows, prev?.stats.noShows, {lowerIsBetter: true, title: `vs ${prevLabel}`})} />
        <StatCard label="Attended, no treatment" value={s.attendedNoTreatment} icon="DoorOpen" tone="amber" trend={makeTrend(s.attendedNoTreatment, prev?.stats.attendedNoTreatment, {lowerIsBetter: true, title: `vs ${prevLabel}`})} />
        <StatCard label="Upcoming" value={s.upcoming} icon="Clock" tone="teal" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Status breakdown" icon="PieChart">
          {report.byStatus.length === 0 ? (
            <EmptyStateCompact message="No appointments in the selected period" />
          ) : (
            <ReportDonut
              data={report.byStatus.map((r) => ({ name: String(r.status), value: Number(r.count) }))}
              formatName={labelize}
            />
          )}
        </SectionCard>

        <SectionCard title="Last 14 days" icon="TrendingUp">
          <ReportBarChart data={report.byDay} xKey="day" xInterval={1} series={[{ key: "total", name: "Booked", color: NAVY }, { key: "completed", name: "Completed", color: TEAL }]} />
        </SectionCard>
      </div>

      <SectionCard title="By therapist" icon="Users" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          minWidth="min-w-96"
          rows={report.byTherapist}
          rowKey={(t) => t.id}
          empty={<EmptyStateCompact message="No appointment activity" />}
          columns={[
            { id: "therapist", header: "Therapist", cell: (t) => <span className="text-sm font-medium">{t.therapist}</span> },
            { id: "completed", header: "Completed", align: "right", cell: (t) => <span className="text-sm">{t.completed}</span> },
            { id: "cancelled", header: "Cancelled", align: "right", cell: (t) => <span className="text-sm">{t.cancelled}</span> },
            { id: "noShow", header: "No-shows", align: "right", cell: (t) => <span className="text-sm">{t.noShow}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
