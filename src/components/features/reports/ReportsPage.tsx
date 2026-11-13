"use client";
// FEATURE: Reports — patients / appointments / clinical / financial / staff with date range, charts, CSV export
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PERMS, labelize } from "@/lib/constants";
import { formatMoney, formatDate, ymd } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from "recharts";
import { hasPermission, useAuthStore } from "@/stores/app-store";

type ReportType = "patients" | "appointments" | "clinical" | "financial" | "staff";
type RangePreset = "today" | "week" | "month" | "quarter" | "custom";

const TEAL = "#0e9f8a";
const NAVY = "#123c66";
const PIE_COLORS = ["#123c66", "#0e9f8a", "#f59e0b", "#0ea5e9", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b", "#a3e635"];

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
  stats: { therapists: number; totalCompletedSessions: number; uniquePatientsSeen: number; estimatedRemunerationCents: number };
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

  const [type, setType] = useState<ReportType>("patients");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", type, range.from, range.to],
    queryFn: () => apiFetch<{ type: string; from: string; to: string; report: ReportData }>(`/api/reports?type=${type}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
    enabled: canView,
  });

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
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <TabsList>
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
            <Button variant="outline" size="sm" onClick={exportCurrent} disabled={!data}>
              <AtomIcon name="Download" className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        }
      />

      <Tabs value={type} onValueChange={(v) => setType(v as ReportType)} className="mb-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.type} value={t.type}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
          {type === "patients" && <PatientsTab report={data.report as PatientsReport} />}
          {type === "appointments" && <AppointmentsTab report={data.report as AppointmentsReport} />}
          {type === "clinical" && <ClinicalTab report={data.report as ClinicalReport} />}
          {type === "financial" && <FinancialTab report={data.report as FinancialReport} />}
          {type === "staff" && <StaffTab report={data.report as StaffReport} />}
        </>
      )}
    </div>
  );
}

// ---------------- Tabs ----------------

function PatientsTab({ report }: { report: PatientsReport }) {
  const s = report.stats;
  const totalReferrals = report.referralSources.reduce((sum, r) => sum + r.count, 0) || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total registered" value={s.totalRegistered} icon="Users" tone="navy" hint="all time" />
        <StatCard label="New in period" value={s.newPatients} icon="UserPlus" tone="teal" />
        <StatCard label="Returning patients" value={s.returningPatients} icon="Repeat" tone="sky" hint=">1 episode or earlier sessions" />
        <StatCard label="Active episodes" value={s.activeEpisodes} icon="GitBranch" tone="emerald" />
        <StatCard label="Discharged in period" value={s.dischargedCount} icon="LogOut" tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Referral sources" icon="Share2">
          {report.referralSources.length === 0 ? (
            <EmptyStateCompact message="No referral data" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.referralSources} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}>
                    {report.referralSources.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(v: number, name: string) => [`${v} (${Math.round((v / totalReferrals) * 100)}%)`, labelize(name)]} />
                  <Legend formatter={(v: string) => labelize(v)} iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Registrations — last 6 months" icon="BarChart3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.registrationsByMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={26} />
                <ReTooltip />
                <Bar dataKey="count" fill={NAVY} radius={[4, 4, 0, 0]} name="New patients" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Discharged in period" icon="LogOut" noPadding>
        {report.discharged.length === 0 ? (
          <div className="p-4"><EmptyStateCompact message="No discharges in the selected period" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Episode</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Therapist</TableHead>
                  <TableHead>Discharged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.discharged.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{d.patientName}</p>
                      <p className="text-xs text-muted-foreground">{d.patientCode}</p>
                    </TableCell>
                    <TableCell className="text-sm">{d.episodeTitle}</TableCell>
                    <TableCell className="text-sm">{d.sessions}</TableCell>
                    <TableCell className="text-sm">{d.therapist}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(d.closedDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function AppointmentsTab({ report }: { report: AppointmentsReport }) {
  const s = report.stats;
  const total = s.total || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total appointments" value={s.total} icon="CalendarDays" tone="navy" />
        <StatCard label="Completed" value={s.completed} icon="CheckCircle2" tone="emerald" hint={`${Math.round((s.completed / total) * 100)}%`} />
        <StatCard label="Cancelled" value={s.cancelled} icon="XCircle" tone="sky" />
        <StatCard label="No-shows" value={s.noShows} icon="UserX" tone="rose" />
        <StatCard label="Attended, no treatment" value={s.attendedNoTreatment} icon="DoorOpen" tone="amber" />
        <StatCard label="Upcoming" value={s.upcoming} icon="Clock" tone="teal" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Status breakdown" icon="PieChart">
          {report.byStatus.length === 0 ? (
            <EmptyStateCompact message="No appointments in the selected period" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}>
                    {report.byStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(v: number, name: string) => [`${v} (${Math.round((v / total) * 100)}%)`, labelize(name)]} />
                  <Legend formatter={(v: string) => labelize(v)} iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Last 14 days" icon="TrendingUp">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.byDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={26} />
                <ReTooltip />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" fill={NAVY} radius={[3, 3, 0, 0]} name="Booked" />
                <Bar dataKey="completed" fill={TEAL} radius={[3, 3, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="By therapist" icon="Users" noPadding>
        {report.byTherapist.length === 0 ? (
          <div className="p-4"><EmptyStateCompact message="No appointment activity" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Therapist</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Cancelled</TableHead>
                  <TableHead className="text-right">No-shows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byTherapist.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm font-medium">{t.therapist}</TableCell>
                    <TableCell className="text-right text-sm">{t.completed}</TableCell>
                    <TableCell className="text-right text-sm">{t.cancelled}</TableCell>
                    <TableCell className="text-right text-sm">{t.noShow}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ClinicalTab({ report }: { report: ClinicalReport }) {
  const s = report.stats;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Completed sessions" value={s.completedSessions} icon="Activity" tone="teal" hint="in period" />
        <StatCard label="Active episodes" value={s.activeEpisodes} icon="GitBranch" tone="navy" />
        <StatCard label="Reviews due" value={s.reviewsDue} icon="TrendingUp" tone="amber" />
        <StatCard label="Discharges" value={s.discharges} icon="LogOut" tone="sky" />
        <StatCard label="Avg sessions / episode" value={s.averageSessionsPerEpisode} icon="Hash" tone="emerald" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Completed sessions — last 6 months" icon="BarChart3">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.sessionsByMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={26} />
                <ReTooltip />
                <Bar dataKey="count" fill={TEAL} radius={[4, 4, 0, 0]} name="Completed sessions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
        {report.reviewsDueList.length === 0 ? (
          <div className="p-4"><EmptyStateCompact message="All caught up — no reviews due" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Episode</TableHead>
                  <TableHead>Sessions since review</TableHead>
                  <TableHead className="hidden md:table-cell">Total sessions</TableHead>
                  <TableHead>Therapist</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.reviewsDueList.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{e.patientName}</p>
                      <p className="text-xs text-muted-foreground">{e.patientCode}</p>
                    </TableCell>
                    <TableCell className="text-sm">{e.episodeTitle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        {e.sessionsSinceReview}/{e.threshold}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{e.totalSessions}</TableCell>
                    <TableCell className="text-sm">{e.therapist}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function FinancialTab({ report }: { report: FinancialReport }) {
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
        <StatCard label="Revenue collected" value={formatMoney(s.totalRevenueCents)} icon="Wallet" tone="teal" hint="payments in period" />
        <StatCard label="Outstanding" value={formatMoney(s.outstandingCents)} icon="Receipt" tone="rose" hint={`${s.outstandingCount} invoices`} />
        <StatCard label="Refunds" value={formatMoney(s.refundsCents)} icon="Undo2" tone="amber" />
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
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.revenueByMethod} dataKey="amountCents" nameKey="method" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}>
                    {report.revenueByMethod.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(v: number, name: string) => [formatMoney(v), labelize(name)]} />
                  <Legend formatter={(v: string) => labelize(v)} iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Revenue by arrangement" icon="Layers">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={arrData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `₵${v}`} />
                <ReTooltip formatter={(v: number) => [formatMoney(v), "Revenue"]} />
                <Bar dataKey="amountCents" name="Revenue" radius={[4, 4, 0, 0]}>
                  {arrData.map((_, i) => (
                    <Cell key={i} fill={[NAVY, TEAL, "#0ea5e9"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
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
        {report.outstandingList.length === 0 ? (
          <div className="p-4"><EmptyStateCompact message="No outstanding invoices — all settled" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Arrangement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.outstandingList.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{i.patientName}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(i.totalCents)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(i.paidCents)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-rose-700">{formatMoney(i.outstandingCents)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{labelize(i.arrangement)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function StaffTab({ report }: { report: StaffReport }) {
  const chartData = report.rows.map((r) => ({ name: r.name.split(" ")[0], sessions: r.completedSessions, unique: r.uniquePatients }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Therapists" value={report.stats.therapists} icon="Stethoscope" tone="navy" />
        <StatCard label="Completed sessions" value={report.stats.totalCompletedSessions} icon="Activity" tone="teal" hint="all therapists, in period" />
        <StatCard label="Unique patients seen" value={report.stats.uniquePatientsSeen} icon="Users" tone="sky" hint="distinct patients across sessions" />
        <StatCard label="Est. remuneration" value={formatMoney(report.stats.estimatedRemunerationCents)} icon="Wallet" tone="emerald" hint="PER_SESSION / PER_PATIENT" />
      </div>

      <SectionCard title="Completed sessions by therapist" icon="BarChart3">
        {chartData.length === 0 ? (
          <EmptyStateCompact message="No therapist data" />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={26} />
                <ReTooltip />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sessions" fill={TEAL} radius={[4, 4, 0, 0]} name="Completed sessions" />
                <Bar dataKey="unique" fill={NAVY} radius={[4, 4, 0, 0]} name="Unique patients" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Therapist workload" icon="Users" description="Unique patients vs completed sessions — PER_PATIENT pays on unique patients, PER_SESSION on completed sessions" noPadding>
        {report.rows.length === 0 ? (
          <div className="p-4"><EmptyStateCompact message="No therapists configured" /></div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Therapist</TableHead>
                  <TableHead className="hidden md:table-cell">Job title</TableHead>
                  <TableHead className="text-right">Completed sessions</TableHead>
                  <TableHead className="text-right">Unique patients</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Active episodes</TableHead>
                  <TableHead className="hidden md:table-cell">Remuneration</TableHead>
                  <TableHead className="text-right">Computed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{r.jobTitle}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{r.completedSessions}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-teal-700">{r.uniquePatients}</TableCell>
                    <TableCell className="text-right text-sm hidden lg:table-cell">{r.activeEpisodes}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm">{labelize(r.remunerationMethod)}</span>
                      {r.rateCents !== null && <span className="ml-1 text-xs text-muted-foreground">· {formatMoney(r.rateCents)}</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.computedCents !== null ? formatMoney(r.computedCents) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
