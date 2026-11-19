"use client";
// Reports: staff report tab.

import { labelize } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { ReportBarChart } from "./ReportBarChart";
import { DataTable } from "@/components/molecules/data-table";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { StaffReport } from "./report-types";
import { TEAL, NAVY } from "./report-utils";

export function StaffTab({ report, prev, prevLabel }: { report: StaffReport; prev?: StaffReport; prevLabel: string }) {
  const chartData = report.rows.map((r) => ({ name: r.name.split(" ")[0], sessions: r.completedSessions, unique: r.uniquePatients }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Therapists" value={report.stats.therapists} icon="Stethoscope" tone="navy" />
        <StatCard label="Completed sessions" value={report.stats.totalCompletedSessions} icon="Activity" tone="teal" hint="all therapists, in period" trend={makeTrend(report.stats.totalCompletedSessions, prev?.stats.totalCompletedSessions, { title: `vs ${prevLabel}` })} />
        <StatCard label="Unique patients seen" value={report.stats.uniquePatientsSeen} icon="Users" tone="sky" hint="distinct patients across sessions" trend={makeTrend(report.stats.uniquePatientsSeen, prev?.stats.uniquePatientsSeen, { title: `vs ${prevLabel}` })} />
        <StatCard label="Est. remuneration" value={formatMoney(report.stats.estimatedRemunerationCents)} icon="Wallet" tone="emerald" hint="therapist pay + staff salaries" trend={makeTrend(report.stats.estimatedRemunerationCents, prev?.stats.estimatedRemunerationCents, { neutral: true, title: `vs ${prevLabel}` })} />
      </div>

      <SectionCard title="Completed sessions by therapist" icon="BarChart3">
        {chartData.length === 0 ? (
          <EmptyStateCompact message="No therapist data" />
        ) : (
          <ReportBarChart data={chartData} xKey="name" series={[{ key: "sessions", name: "Completed sessions", color: TEAL }, { key: "unique", name: "Unique patients", color: NAVY }]} />
        )}
      </SectionCard>

      <SectionCard title="Therapist workload" icon="Users" description="Unique patients vs completed sessions — PER_PATIENT pays on unique patients, PER_SESSION on completed sessions" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          rows={report.rows}
          rowKey={(r) => r.id}
          empty={<EmptyStateCompact message="No therapists configured" />}
          columns={[
            { id: "name", header: "Therapist", cell: (r) => <span className="text-sm font-medium">{r.name}</span> },
            { id: "job", header: "Job title", hideBelow: "md", cell: (r) => <span className="text-sm text-muted-foreground">{r.jobTitle}</span> },
            { id: "sessions", header: "Completed sessions", align: "right", cell: (r) => <span className="text-sm font-semibold">{r.completedSessions}</span> },
            { id: "patients", header: "Unique patients", align: "right", cell: (r) => <span className="text-sm font-semibold text-navy-800">{r.uniquePatients}</span> },
            { id: "episodes", header: "Active episodes", align: "right", hideBelow: "lg", cell: (r) => <span className="text-sm">{r.activeEpisodes}</span> },
            {
              id: "rem", header: "Remuneration", hideBelow: "md",
              cell: (r) => (
                <>
                  <span className="text-sm">{labelize(r.remunerationMethod)}</span>
                  {r.rateCents !== null && <span className="ml-1 text-xs text-muted-foreground">· {formatMoney(r.rateCents)}</span>}
                </>
              ),
            },
            { id: "computed", header: "Computed", align: "right", cell: (r) => <span className="text-sm">{r.computedCents !== null ? formatMoney(r.computedCents) : "—"}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
