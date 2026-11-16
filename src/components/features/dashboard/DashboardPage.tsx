"use client";
// FEATURE: Dashboard — operational overview (metrics, clinical, financial, activity)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, minutesToTime, relativeTime, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { ActivityAreaChart, Donut, RevenueAreaChart, StatusBars, VIZ, type TrendPoint } from "./DashboardCharts";
import { APP, PERMS } from "@/lib/constants";
import { AtomIcon } from "@/components/atoms/icon";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

interface DashboardData {
  metrics: {
    totalPatients: number; newPatients: number; activeEpisodes: number; todaysAppointments: number;
    completedSessions: number; reviewsDue: number; outstandingInvoices: number;
    outstandingAmountCents: number; revenueCollectedCents: number;
  };
  revenue: { paygCents: number; packageCents: number; insuranceCents: number };
  reviewsDue: { id: string; patientId: string; patientName: string; patientCode: string; episodeTitle: string; sessionsSinceReview: number; threshold: number; therapist: string }[];
  todaysAppointments: { id: string; patientId: string; patientName: string; patientCode: string; time: number; status: string; purpose: string | null; therapist: string; episodeTitle: string | null }[];
  upcomingAppointments: { id: string; patientId: string; patientName: string; date: string; time: number; status: string; therapist: string }[];
  activeEpisodesList: { id: string; patientId: string; patientName: string; patientCode: string; title: string; status: string; sessions: number; sinceReview: number; threshold: number; therapist: string }[];
  overdueForReview: { id: string; patientId: string; patientName: string; sessionsSinceReview: number; threshold: number }[];
  recentlyDischarged: { id: string; patientId: string; patientName: string; closedDate: string | null }[];
  activity: {
    registrations: { id: string; name: string; code: string; date: string }[];
    payments: { id: string; patient: string; amountCents: number; method: string; date: string }[];
    sessions: { id: string; patient: string; episode: string; therapist: string; date: string }[];
    audit: { id: string; action: string; userName: string | null; date: string; entityType: string }[];
  };
  charts: { trend: TrendPoint[]; appointmentStatus: { status: string; count: number }[]; windowDays: number };
}

type Range = "today" | "week" | "month" | "custom";

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const quickActions = [
    { label: "Patients", hint: "Register & find records", icon: "UserPlus", tone: "bg-navy-50 text-navy-800 group-hover:bg-navy-800 group-hover:text-white", perm: PERMS.patientsView, go: () => navigate("patients") },
    { label: "Appointments", hint: "Book & manage the calendar", icon: "CalendarPlus", tone: "bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white", perm: PERMS.appointmentsView, go: () => navigate("appointments") },
    { label: "Assessments", hint: "Clinical assessments", icon: "ClipboardList", tone: "bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white", perm: PERMS.clinicalView, go: () => navigate("assessments") },
    { label: "Therapy sessions", hint: "Document treatments", icon: "Activity", tone: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white", perm: PERMS.clinicalView, go: () => navigate("therapy-sessions") },
    { label: "Invoices", hint: "Bill & record payments", icon: "Receipt", tone: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white", perm: PERMS.billingView, go: () => navigate("billing", { focusTab: "invoices" }) },
    { label: "Reports", hint: "Operational insights", icon: "BarChart3", tone: "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white", perm: PERMS.reportsView, go: () => navigate("reports") },
  ].filter((q) => hasPermission(user, q.perm));

  const queryString = range === "custom" && customFrom && customTo
    ? `range=custom&from=${customFrom.toISOString()}&to=${customTo.toISOString()}`
    : `range=${range}`;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range, customFrom?.toISOString(), customTo?.toISOString()],
    queryFn: () => apiFetch<DashboardData>(`/api/dashboard?${queryString}`),
  });

  const m = data?.metrics;
  const trend = data?.charts.trend || [];
  const windowDays = data?.charts.windowDays ?? 7;
  const windowLabel = range === "custom" ? "Selected range" : `Last ${windowDays} days`;
  const windowRevenue = trend.reduce((s, t) => s + t.revenue, 0);
  const avgRevenue = Math.round(windowRevenue / Math.max(1, trend.length));
  const totalAppts = trend.reduce((s, t) => s + t.appointments, 0);
  const totalSessions = trend.reduce((s, t) => s + t.sessions, 0);
  const totalNewPatients = trend.reduce((s, t) => s + t.newPatients, 0);
  const mix = [
    { name: "Pay-as-you-go", value: data?.revenue.paygCents ?? 0, color: VIZ.blue },
    { name: "Packages", value: data?.revenue.packageCents ?? 0, color: VIZ.teal },
    { name: "Insurance", value: data?.revenue.insuranceCents ?? 0, color: VIZ.amber },
  ];
  const mixTotal = mix.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of clinic activity"
        icon="LayoutDashboard"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-1.5">
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="h-8">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This week</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
            <TabsTrigger value="custom" className="gap-1">
              <AtomIcon name="CalendarRange" className="h-3.5 w-3.5" />
              {range === "custom" && customFrom && customTo
                ? `${formatDate(customFrom, { month: "short", day: "numeric" })} – ${formatDate(customTo, { month: "short", day: "numeric" })}`
                : "Custom"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {range === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-40 justify-start font-normal">
                  <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                  {customFrom ? formatDate(customFrom) : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-40 justify-start font-normal">
                  <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                  {customTo ? formatDate(customTo) : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        <StatCard label="Patients" value={m?.totalPatients ?? 0} icon="Users" tone="navy" loading={isLoading} hint={`+${m?.newPatients ?? 0} new`} onClick={() => navigate("patients")} />
        <StatCard label="Active episodes" value={m?.activeEpisodes ?? 0} icon="GitBranch" tone="teal" loading={isLoading} onClick={() => navigate("patients")} />
        <StatCard label="Appts today" value={m?.todaysAppointments ?? 0} icon="CalendarDays" tone="sky" loading={isLoading} onClick={() => navigate("appointments")} />
        <StatCard label="Sessions done" value={m?.completedSessions ?? 0} icon="Activity" tone="emerald" loading={isLoading} hint="in period" onClick={() => navigate("therapy-sessions")} />
        <StatCard label="Reviews due" value={m?.reviewsDue ?? 0} icon="TrendingUp" tone="amber" loading={isLoading} onClick={() => navigate("progress-reviews")} />
        <StatCard label="Open invoices" value={m?.outstandingInvoices ?? 0} icon="Receipt" tone="rose" loading={isLoading} hint={m ? formatMoney(m.outstandingAmountCents) : undefined} onClick={() => navigate("billing", { focusTab: "invoices" })} />
        <StatCard label="Revenue" value={m ? formatMoney(m.revenueCollectedCents) : "—"} icon="Wallet" tone="teal" loading={isLoading} hint="in period" onClick={() => navigate("billing")} />
      </div>

      {/* Three independent columns — cards keep their natural height */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coming up</p>
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
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Today's appointments" icon="CalendarDays" loading={isLoading}
              actions={<Button variant="outline" size="sm" onClick={() => navigate("appointments")}>View all</Button>}>
              {(data?.todaysAppointments || []).length === 0 ? (
                <EmptyState icon="CalendarX" title="No appointments today" description="Booked appointments will appear here." />
              ) : (
                <ScrollArea className="max-h-72 custom-scrollbar">
                  <div className="space-y-1.5">
                    {(data?.todaysAppointments || []).map((a) => (
                      <button key={a.id} type="button" className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50" onClick={() => navigate("appointments", { appointmentId: a.id })}>
                        <span className="w-16 shrink-0 rounded-md bg-navy-50 py-1 text-center text-xs font-semibold text-navy-800">{minutesToTime(a.time)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.patientName} <span className="text-xs text-muted-foreground">{a.patientCode}</span></p>
                          <p className="truncate text-xs text-muted-foreground">{a.purpose || "Session"} · {a.therapist}{a.episodeTitle ? ` · ${a.episodeTitle}` : ""}</p>
                        </div>
                        <StatusBadge status={a.status} />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </SectionCard>

          <SectionCard title="Quick actions" icon="Zap" description="Jump straight into common tasks">
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((q) => (
                <button key={q.label} type="button" onClick={q.go}
                  className="group relative flex min-h-[92px] flex-col items-start gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-colors", q.tone)}>
                    <AtomIcon name={q.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">{q.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{q.hint}</span>
                  </span>
                  <AtomIcon name="ArrowUpRight" className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-600" />
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Recent activity" icon="History" loading={isLoading} className="flex-1">
              <ScrollArea className="max-h-96 custom-scrollbar">
                <div className="space-y-2.5">
                  {(data?.activity.registrations || []).slice(0, 3).map((r) => (
                    <ActivityRow key={`reg-${r.id}`} icon="UserPlus" title={`${r.name} registered`} subtitle={r.code} date={r.date} />
                  ))}
                  {(data?.activity.payments || []).slice(0, 3).map((p) => (
                    <ActivityRow key={`pay-${p.id}`} icon="Banknote" title={`${formatMoney(p.amountCents)} — ${p.patient}`} subtitle={p.method.replace("_", " ")} date={p.date} />
                  ))}
                  {(data?.activity.sessions || []).slice(0, 3).map((s) => (
                    <ActivityRow key={`ses-${s.id}`} icon="Activity" title={`Session completed — ${s.patient}`} subtitle={s.therapist} date={s.date} />
                  ))}
                  {(data?.activity.audit || []).slice(0, 4).map((a) => (
                    <ActivityRow key={`aud-${a.id}`} icon="ShieldCheck" title={a.action.replaceAll("_", " ")} subtitle={a.userName || "System"} date={a.date} />
                  ))}
                </div>
              </ScrollArea>
            </SectionCard>
        </div>
      </div>
    </div>
  );
}

function EmptyStateCompact({ title }: { title: string }) {
  return <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{title}</div>;
}

function ActivityRow({ icon, title, subtitle, date }: { icon: string; title: string; subtitle?: string; date: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <AtomIcon name={icon} className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(date)}</span>
    </div>
  );
}
