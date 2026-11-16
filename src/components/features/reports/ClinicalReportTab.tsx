"use client";
// Reports: clinical report tab.

import { ReportBarChart } from "./ReportBarChart";
import { DataTable } from "@/components/molecules/data-table";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ClinicalReport } from "./report-types";
import { TEAL } from "./report-utils";

export function ClinicalTab({ report, prev, prevLabel }: { report: ClinicalReport; prev?: ClinicalReport; prevLabel: string }) {
  const s = report.stats;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Completed sessions" value={s.completedSessions} icon="Activity" tone="teal" hint="in period" trend={makeTrend(s.completedSessions, prev?.stats.completedSessions, { title: `vs ${prevLabel}` })} />
        <StatCard label="Active episodes" value={s.activeEpisodes} icon="GitBranch" tone="navy" />
        <StatCard label="Reviews due" value={s.reviewsDue} icon="TrendingUp" tone="amber" />
        <StatCard label="Discharges" value={s.discharges} icon="LogOut" tone="sky" trend={makeTrend(s.discharges, prev?.stats.discharges, { neutral: true, title: `vs ${prevLabel}` })} />
        <StatCard label="Avg sessions / episode" value={s.averageSessionsPerEpisode} icon="Hash" tone="emerald" trend={makeTrend(s.averageSessionsPerEpisode, prev?.stats.averageSessionsPerEpisode, { neutral: true, title: `vs ${prevLabel}` })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Completed sessions — last 6 months" icon="BarChart3">
          <ReportBarChart data={report.sessionsByMonth} xKey="month" series={[{ key: "count", name: "Completed sessions", color: TEAL }]} />
        </SectionCard>

        <SectionCard title="Treatment outcomes" icon="Target" description="Discharges by objective achievement">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-emerald-50 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{report.dischargeStats.treatmentOutcomes.objectivesAchieved}</p>
                <p className="text-xs text-emerald-700">Objectives achieved</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4 text-center">
                <p className="text-2xl font-bold text-slate-600">{report.dischargeStats.treatmentOutcomes.other}</p>
                <p className="text-xs text-muted-foreground">Other reasons</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discharge reasons</p>
              {report.dischargeStats.byReason.length === 0 ? (
                <EmptyStateCompact message="No discharges in period" />
              ) : (
                report.dischargeStats.byReason.map((r) => {
                  const pct = Math.round((r.count / (report.dischargeStats.discharges || 1)) * 100);
                  return (
                    <div key={r.reason}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{r.reason}</span>
                        <span className="text-muted-foreground">{r.count} · {pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Patients due for review" icon="TrendingUp" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          rows={report.reviewsDueList}
          rowKey={(e) => e.id}
          empty={<EmptyStateCompact message="All caught up — no reviews due" />}
          columns={[
            { id: "patient", header: "Patient", cell: (e) => (<><p className="text-sm font-medium">{e.patientName}</p><p className="text-xs text-muted-foreground">{e.patientCode}</p></>) },
            { id: "episode", header: "Episode", cell: (e) => <span className="text-sm">{e.episodeTitle}</span> },
            { id: "since", header: "Sessions since review", cell: (e) => <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{e.sessionsSinceReview}/{e.threshold}</Badge> },
            { id: "total", header: "Total sessions", hideBelow: "md", cell: (e) => <span className="text-sm">{e.totalSessions}</span> },
            { id: "therapist", header: "Therapist", cell: (e) => <span className="text-sm">{e.therapist}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
