"use client";
// FEATURE: Reports — patients / appointments / clinical / financial / staff with date range, charts, CSV export
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PERMS, labelize } from "@/lib/constants";
import { formatMoney, formatDate, ymd } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { ReportDonut } from "./ReportDonut";
import { ReportBarChart } from "./ReportBarChart";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState, EmptyStateCompact } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { hasPermission, useAuthStore } from "@/stores/app-store";

type ReportType = "patients" | "appointments" | "clinical" | "financial" | "staff";
type RangePreset = "today" | "week" | "month" | "quarter" | "custom";
const PRESETS: RangePreset[] = ["today", "week", "month", "quarter", "custom"];

function parseYmd(v: string | null): Date | undefined {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** The equally long, day-aligned period immediately before `range`. */
function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1, 23, 59, 59, 999);
  const prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - (days - 1), 0, 0, 0, 0);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

const TEAL = "#0e9f8a";
const NAVY = "#123c66";

function rangeFor(preset: RangePreset, customFrom?: Date, customTo?: Date): { from: string; to: string; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (preset === "today") return { from: start.toISOString(), to: end.toISOString(), label: "Today" };
  if (preset === "week") {
    const s = new Date(start);
    s.setDate(s.getDate() - 6);
    return { from: s.toISOString(), to: end.toISOString(), label: "This week" };
  }
  if (preset === "quarter") {
    const s = new Date(start);
    s.setDate(s.getDate() - 89);
    return { from: s.toISOString(), to: end.toISOString(), label: "Last 3 months" };
  }
  if (preset === "custom" && customFrom && customTo) {
    const s = new Date(customFrom);
    s.setHours(0, 0, 0, 0);
    const e = new Date(customTo);
    e.setHours(23, 59, 59, 999);
    return { from: s.toISOString(), to: e.toISOString(), label: "Custom range" };
  }
  const s = new Date(start);
  s.setDate(s.getDate() - 29);
  return { from: s.toISOString(), to: end.toISOString(), label: "This month" };
}

// ---- CSV helper ----
function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Report response shapes ----
interface PatientsReport {
  stats: { totalRegistered: number; newPatients: number; returningPatients: number; activeEpisodes: number; dischargedCount: number };
  referralSources: { source: string; count: number }[];
  registrationsByMonth: { month: string; count: number }[];
  discharged: { id: string; patientName: string; patientCode: string; episodeTitle: string; sessions: number; therapist: string; closedDate: string }[];
}
interface AppointmentsReport {
  stats: { total: number; completed: number; cancelled: number; noShows: number; attendedNoTreatment: number; upcoming: number };
  byStatus: { status: string; count: number }[];
  byTherapist: { id: string; therapist: string; completed: number; cancelled: number; noShow: number }[];
  byDay: { day: string; total: number; completed: number }[];
}
interface ClinicalReport {
  stats: { completedSessions: number; activeEpisodes: number; reviewsDue: number; discharges: number; averageSessionsPerEpisode: number };
  sessionsByMonth: { month: string; count: number }[];
  reviewsDueList: { id: string; patientName: string; patientCode: string; episodeTitle: string; sessionsSinceReview: number; threshold: number; totalSessions: number; therapist: string }[];
  dischargeStats: { discharges: number; byReason: { reason: string; count: number }[]; treatmentOutcomes: { objectivesAchieved: number; other: number } };
}
interface FinancialReport {
  stats: { totalRevenueCents: number; outstandingCents: number; outstandingCount: number; refundsCents: number };
  revenueByMethod: { method: string; amountCents: number }[];
  byArrangement: { paygCents: number; packageCents: number; insuranceCents: number };
  claims: { open: number; submittedCents: number; approvedCents: number; outstandingCents: number };
  packageUtilisation: { usedSessions: number; totalSessions: number; percent: number };
  outstandingList: { id: string; invoiceNumber: string; patientName: string; totalCents: number; paidCents: number; outstandingCents: number; status: string; arrangement: string; dueDate: string | null }[];
}
interface StaffReport {
  stats: { therapists: number; totalCompletedSessions: number; uniquePatientsSeen: number; estimatedRemunerationCents: number; staffSalariesCents?: number };
  rows: { id: string; name: string; jobTitle: string; completedSessions: number; uniquePatients: number; activeEpisodes: number; remunerationMethod: string; rateCents: number | null; computedCents: number | null }[];
}
type ReportData = PatientsReport | AppointmentsReport | ClinicalReport | FinancialReport | StaffReport;

const TABS: { type: ReportType; label: string }[] = [
  { type: "patients", label: "Patients" },
  { type: "appointments", label: "Appointments" },
  { type: "clinical", label: "Clinical" },
  { type: "financial", label: "Financial" },
  { type: "staff", label: "Staff" },
];

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, PERMS.reportsView);

  // report type + date range live in the address bar (?type=financial&range=week), so refresh and shared links keep them
  const params = useSearchParams();
  const [type, setType] = useState<ReportType>(() => {
    const t = params.get("type");
    return TABS.some((x) => x.type === t) ? (t as ReportType) : "patients";
  });
  const [preset, setPreset] = useState<RangePreset>(() => {
    const r = params.get("range");
    return PRESETS.includes(r as RangePreset) ? (r as RangePreset) : "month";
  });
  const [customFrom, setCustomFrom] = useState<Date | undefined>(() => parseYmd(params.get("from")));
  const [customTo, setCustomTo] = useState<Date | undefined>(() => parseYmd(params.get("to")));

  useEffect(() => {
    const q = new URLSearchParams();
    if (type !== "patients") q.set("type", type);
    if (preset !== "month") q.set("range", preset);
    if (preset === "custom" && customFrom) q.set("from", ymd(customFrom));
    if (preset === "custom" && customTo) q.set("to", ymd(customTo));
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [type, preset, customFrom, customTo]);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["reports", type, range.from, range.to],
    queryFn: () => apiFetch<{ type: string; from: string; to: string; report: ReportData }>(`/api/reports?type=${type}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
    enabled: canView,
  });

  // same report for the previous period of equal length, used for the change chips on the stat cards
  const prevRange = useMemo(() => previousRange(range), [range]);
  const { data: prevData } = useQuery({
    queryKey: ["reports", type, prevRange.from, prevRange.to],
    queryFn: () => apiFetch<{ type: string; from: string; to: string; report: ReportData }>(`/api/reports?type=${type}&from=${encodeURIComponent(prevRange.from)}&to=${encodeURIComponent(prevRange.to)}`),
    enabled: canView && (preset !== "custom" || (!!customFrom && !!customTo)),
  });
  const prevLabel = `${formatDate(prevRange.from, { day: "numeric", month: "short" })} – ${formatDate(prevRange.to, { day: "numeric", month: "short" })}`;

  const csvPrefix = `gmrs-${type}-${ymd(new Date())}`;

  const exportCurrent = () => {
    if (!data) return;
    const r = data.report;
    if (type === "patients") {
      const p = r as PatientsReport;
      exportCsv(`${csvPrefix}.csv`, ["Patient", "Code", "Episode", "Sessions", "Therapist", "Discharged"],
        p.discharged.map((d) => [d.patientName, d.patientCode, d.episodeTitle, d.sessions, d.therapist, formatDate(d.closedDate)]));
    } else if (type === "appointments") {
      const a = r as AppointmentsReport;
      exportCsv(`${csvPrefix}.csv`, ["Therapist", "Completed", "Cancelled", "No-shows"],
        a.byTherapist.map((t) => [t.therapist, t.completed, t.cancelled, t.noShow]));
    } else if (type === "clinical") {
      const c = r as ClinicalReport;
      exportCsv(`${csvPrefix}.csv`, ["Patient", "Code", "Sessions since review", "Threshold", "Total sessions", "Therapist"],
        c.reviewsDueList.map((e) => [e.patientName, e.patientCode, e.sessionsSinceReview, e.threshold, e.totalSessions, e.therapist]));
    } else if (type === "financial") {
      const f = r as FinancialReport;
      exportCsv(`${csvPrefix}.csv`, ["Invoice", "Patient", "Total", "Paid", "Outstanding", "Status", "Arrangement", "Due"],
        f.outstandingList.map((i) => [i.invoiceNumber, i.patientName, formatMoney(i.totalCents), formatMoney(i.paidCents), formatMoney(i.outstandingCents), i.status, i.arrangement, i.dueDate ? formatDate(i.dueDate) : "—"]));
    } else {
      const s = r as StaffReport;
      exportCsv(`${csvPrefix}.csv`, ["Therapist", "Completed sessions", "Unique patients", "Active episodes", "Remuneration method", "Computed remuneration"],
        s.rows.map((t) => [t.name, t.completedSessions, t.uniquePatients, t.activeEpisodes, labelize(t.remunerationMethod), t.computedCents !== null ? formatMoney(t.computedCents) : "—"]));
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Operational, clinical and financial reporting"
        icon="BarChart3"
        filters={
          <Tabs value={type} onValueChange={(v) => setType(v as ReportType)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.type} value={t.type}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="mb-4">
        <DataToolbar
          filters={
            <>
              <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
                <TabsList className="h-8">
                  <TabsTrigger value="today">Today</TabsTrigger>
                  <TabsTrigger value="week">This week</TabsTrigger>
                  <TabsTrigger value="month">This month</TabsTrigger>
                  <TabsTrigger value="quarter">Last 3 months</TabsTrigger>
                  <TabsTrigger value="custom" className="gap-1">
                    <AtomIcon name="CalendarRange" className="h-3.5 w-3.5" />
                    {preset === "custom" && customFrom && customTo
                      ? `${formatDate(customFrom, { month: "short", day: "numeric" })} – ${formatDate(customTo, { month: "short", day: "numeric" })}`
                      : "Custom"}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {preset === "custom" && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start font-normal">
                        <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                        {customFrom ? formatDate(customFrom) : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start font-normal">
                        <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                        {customTo ? formatDate(customTo) : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </>
          }
          onRefresh={() => void refetch()}
          refreshing={isFetching}
        >
          <Button variant="outline" size="sm" onClick={exportCurrent} disabled={!data}>
            <AtomIcon name="Download" className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        </DataToolbar>
      </div>

      {canView && data ? (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AtomIcon name="TrendingUp" className="h-3.5 w-3.5" />
          Change chips compare with the previous period ({prevLabel}).
        </p>
      ) : null}

      {!canView ? (
        <EmptyState icon="Lock" title="No access" description="You do not have permission to view reports." />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : (
        <>
          {type === "patients" && <PatientsTab report={data.report as PatientsReport} prev={prevData?.report as PatientsReport | undefined} prevLabel={prevLabel} />}
          {type === "appointments" && <AppointmentsTab report={data.report as AppointmentsReport} prev={prevData?.report as AppointmentsReport | undefined} prevLabel={prevLabel} />}
          {type === "clinical" && <ClinicalTab report={data.report as ClinicalReport} prev={prevData?.report as ClinicalReport | undefined} prevLabel={prevLabel} />}
          {type === "financial" && <FinancialTab report={data.report as FinancialReport} prev={prevData?.report as FinancialReport | undefined} prevLabel={prevLabel} />}
          {type === "staff" && <StaffTab report={data.report as StaffReport} prev={prevData?.report as StaffReport | undefined} prevLabel={prevLabel} />}
        </>
      )}
    </div>
  );
}

// ---------------- Tabs ----------------

function PatientsTab({ report, prev, prevLabel }: { report: PatientsReport; prev?: PatientsReport; prevLabel: string }) {
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

function AppointmentsTab({ report, prev, prevLabel }: { report: AppointmentsReport; prev?: AppointmentsReport; prevLabel: string }) {
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

function ClinicalTab({ report, prev, prevLabel }: { report: ClinicalReport; prev?: ClinicalReport; prevLabel: string }) {
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

function FinancialTab({ report, prev, prevLabel }: { report: FinancialReport; prev?: FinancialReport; prevLabel: string }) {
  const s = report.stats;
  const arr = report.byArrangement;
  const arrData = [
    { name: "Pay-as-you-go", amountCents: arr.paygCents },
    { name: "Packages", amountCents: arr.packageCents },
    { name: "Insurance", amountCents: arr.insuranceCents },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue collected" value={formatMoney(s.totalRevenueCents)} icon="Wallet" tone="teal" hint="payments in period" trend={makeTrend(s.totalRevenueCents, prev?.stats.totalRevenueCents, { title: `vs ${prevLabel}` })} />
        <StatCard label="Outstanding" value={formatMoney(s.outstandingCents)} icon="Receipt" tone="rose" hint={`${s.outstandingCount} invoices`} />
        <StatCard label="Refunds" value={formatMoney(s.refundsCents)} icon="Undo2" tone="amber" trend={makeTrend(s.refundsCents, prev?.stats.refundsCents, { lowerIsBetter: true, title: `vs ${prevLabel}` })} />
        <StatCard
          label="Claims outstanding"
          value={formatMoney(report.claims.outstandingCents)}
          icon="ShieldAlert"
          tone="sky"
          hint={`${report.claims.open} open claims`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Revenue by payment method" icon="CreditCard">
          {report.revenueByMethod.length === 0 ? (
            <EmptyStateCompact message="No payments in the selected period" />
          ) : (
            <ReportDonut
              data={report.revenueByMethod.map((r) => ({ name: String(r.method), value: Number(r.amountCents) }))}
              formatName={labelize} formatValue={formatMoney}
            />
          )}
        </SectionCard>

        <SectionCard title="Revenue by arrangement" icon="Layers">
          <ReportBarChart data={arrData} xKey="name" series={[{ key: "amountCents", name: "Revenue", color: NAVY }]} colorByPoint={[NAVY, TEAL, "#0ea5e9"]} formatValue={formatMoney} formatAxis={(v) => `₵${v / 100}`} yWidth={52} />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Insurance claims" icon="ShieldCheck" contentClassName="pt-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Open (submitted)</span><span className="font-semibold">{report.claims.open}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Submitted value</span><span className="font-semibold">{formatMoney(report.claims.submittedCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="font-semibold text-emerald-700">{formatMoney(report.claims.approvedCents)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Outstanding on open</span><span className="font-semibold text-rose-700">{formatMoney(report.claims.outstandingCents)}</span></div>
          </div>
        </SectionCard>

        <SectionCard title="Package utilisation" icon="Package" contentClassName="pt-3">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-navy-800">{report.packageUtilisation.percent}%</p>
              <p className="text-xs text-muted-foreground">{report.packageUtilisation.usedSessions} / {report.packageUtilisation.totalSessions} sessions used</p>
            </div>
            <Progress value={report.packageUtilisation.percent} className="h-2.5" />
            <p className="text-xs text-muted-foreground">Across active + exhausted patient packages</p>
          </div>
        </SectionCard>

        <SectionCard title="Revenue split" icon="PieChart" contentClassName="pt-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pay-as-you-go</span><span className="font-semibold">{formatMoney(arr.paygCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Packages</span><span className="font-semibold">{formatMoney(arr.packageCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Insurance</span><span className="font-semibold">{formatMoney(arr.insuranceCents)}</span></div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Outstanding invoices (top 10)" icon="Receipt" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          rows={report.outstandingList}
          rowKey={(i) => i.id}
          empty={<EmptyStateCompact message="No outstanding invoices — all settled" />}
          columns={[
            { id: "invoice", header: "Invoice", cell: (i) => <span className="font-mono text-xs">{i.invoiceNumber}</span> },
            { id: "patient", header: "Patient", cell: (i) => <span className="text-sm">{i.patientName}</span> },
            { id: "total", header: "Total", align: "right", cell: (i) => <span className="text-sm">{formatMoney(i.totalCents)}</span> },
            { id: "paid", header: "Paid", align: "right", cell: (i) => <span className="text-sm">{formatMoney(i.paidCents)}</span> },
            { id: "outstanding", header: "Outstanding", align: "right", cell: (i) => <span className="text-sm font-semibold text-rose-700">{formatMoney(i.outstandingCents)}</span> },
            { id: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
            { id: "arrangement", header: "Arrangement", hideBelow: "md", cell: (i) => <span className="text-sm text-muted-foreground">{labelize(i.arrangement)}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}

function StaffTab({ report, prev, prevLabel }: { report: StaffReport; prev?: StaffReport; prevLabel: string }) {
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
            { id: "patients", header: "Unique patients", align: "right", cell: (r) => <span className="text-sm font-semibold text-teal-700">{r.uniquePatients}</span> },
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
