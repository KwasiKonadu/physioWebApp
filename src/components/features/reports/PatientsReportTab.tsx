"use client";
// Reports: patients report tab.

import { labelize } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { ReportDonut } from "./ReportDonut";
import { ReportBarChart } from "./ReportBarChart";
import { DataTable } from "@/components/molecules/data-table";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { PatientsReport } from "./report-types";
import { NAVY } from "./report-utils";

export function PatientsTab({ report, prev, prevLabel }: { report: PatientsReport; prev?: PatientsReport; prevLabel: string }) {
  const s = report.stats;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total registered" value={s.totalRegistered} icon="Users" tone="navy" hint="all time" />
        <StatCard label="New in period" value={s.newPatients} icon="UserPlus" tone="teal" trend={makeTrend(s.newPatients, prev?.stats.newPatients, {neutral: true, title: `vs ${prevLabel}`})} />
        <StatCard label="Returning patients" value={s.returningPatients} icon="Repeat" tone="sky" hint=">1 episode or earlier sessions" />
        <StatCard label="Active episodes" value={s.activeEpisodes} icon="GitBranch" tone="emerald" />
        <StatCard label="Discharged in period" value={s.dischargedCount} icon="LogOut" tone="amber" trend={makeTrend(s.dischargedCount, prev?.stats.dischargedCount, {neutral: true, title: `vs ${prevLabel}`})} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Referral sources" icon="Share2">
          {report.referralSources.length === 0 ? (
            <EmptyStateCompact message="No referral data" />
          ) : (
            <ReportDonut
              data={report.referralSources.map((r) => ({ name: String(r.source), value: Number(r.count) }))}
              formatName={labelize}
            />
          )}
        </SectionCard>

        <SectionCard title="Registrations — last 6 months" icon="BarChart3">
          <ReportBarChart data={report.registrationsByMonth} xKey="month" series={[{ key: "count", name: "New patients", color: NAVY }]} />
        </SectionCard>
      </div>

      <SectionCard title="Discharged in period" icon="LogOut" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          rows={report.discharged}
          rowKey={(d) => d.id}
          empty={<EmptyStateCompact message="No discharges in the selected period" />}
          columns={[
            { id: "patient", header: "Patient", cell: (d) => (<><p className="text-sm font-medium">{d.patientName}</p><p className="text-xs text-muted-foreground">{d.patientCode}</p></>) },
            { id: "episode", header: "Episode", cell: (d) => <span className="text-sm">{d.episodeTitle}</span> },
            { id: "sessions", header: "Sessions", cell: (d) => <span className="text-sm">{d.sessions}</span> },
            { id: "therapist", header: "Therapist", cell: (d) => <span className="text-sm">{d.therapist}</span> },
            { id: "closed", header: "Discharged", cell: (d) => <span className="text-sm text-muted-foreground">{formatDate(d.closedDate)}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
