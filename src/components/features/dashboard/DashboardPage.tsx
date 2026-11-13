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
import { Bar, BarChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { AtomIcon } from "@/components/atoms/icon";
import { useUIStore } from "@/stores/app-store";
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
  charts: { appointmentsByDay: { day: string; appointments: number }[]; revenueByDay: { day: string; revenue: number }[] };
}

type Range = "today" | "week" | "month" | "custom";

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const navigate = useUIStore((s) => s.navigate);

  const queryString = range === "custom" && customFrom && customTo
    ? `range=custom&from=${customFrom.toISOString()}&to=${customTo.toISOString()}`
    : `range=${range}`;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range, customFrom?.toISOString(), customTo?.toISOString()],
    queryFn: () => apiFetch<DashboardData>(`/api/dashboard?${queryString}`),
  });

  const m = data?.metrics;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of clinic activity"
        icon="LayoutDashboard"
        filters={
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
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
        }
      />

      {range === "custom" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3">
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
        </div>
      )}

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

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* Appointment overview */}
        <SectionCard title="Today's appointments" icon="CalendarDays" loading={isLoading} className="xl:col-span-2"
          actions={<Button variant="outline" size="sm" onClick={() => navigate("appointments")}>View all</Button>}>
          {(data?.todaysAppointments || []).length === 0 ? (
            <EmptyState icon="CalendarX" title="No appointments today" description="Booked appointments will appear here." />
          ) : (
            <ScrollArea className="max-h-80 custom-scrollbar">
              <div className="divide-y">
                {(data?.todaysAppointments || []).map((a) => (
                  <button key={a.id} type="button" className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-navy-50/60" onClick={() => navigate("appointments", { appointmentId: a.id })}>
                    <span className="w-16 shrink-0 text-xs font-semibold text-navy-800">{minutesToTime(a.time)}</span>
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

        {/* Financial overview */}
        <SectionCard title="Financial overview" icon="Wallet" loading={isLoading}>
          <div className="space-y-4">
            <div>
              <p className="text-2xl font-bold text-navy-800">{m ? formatMoney(m.revenueCollectedCents) : "—"}</p>
              <p className="text-xs text-muted-foreground">Collected in selected period</p>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Pay-as-you-go", value: data?.revenue.paygCents ?? 0, color: "bg-navy-700" },
                { label: "Packages", value: data?.revenue.packageCents ?? 0, color: "bg-teal-500" },
                { label: "Insurance", value: data?.revenue.insuranceCents ?? 0, color: "bg-sky-500" },
              ].map((row) => {
                const total = (data?.revenue.paygCents || 0) + (data?.revenue.packageCents || 0) + (data?.revenue.insuranceCents || 0) || 1;
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">{row.label}</span>
                      <span className="font-semibold">{formatMoney(row.value)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full", row.color)} style={{ width: `${Math.round((row.value / total) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium text-rose-700">Outstanding balance</p>
                <p className="text-sm font-bold text-rose-800">{m ? formatMoney(m.outstandingAmountCents) : "—"}</p>
              </div>
              <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-100" onClick={() => navigate("billing", { focusTab: "invoices" })}>
                Review
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* Clinical overview */}
        <SectionCard title="Clinical overview" icon="Stethoscope" loading={isLoading} className="xl:col-span-2"
          actions={<Button variant="outline" size="sm" onClick={() => navigate("patients")}>Patient directory</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active treatment episodes</p>
              {(data?.activeEpisodesList || []).length === 0 ? (
                <EmptyStateCompact title="No active episodes" />
              ) : (
                (data?.activeEpisodesList || []).slice(0, 5).map((e) => (
                  <button key={e.id} type="button" className="w-full rounded-lg border p-2.5 text-left hover:border-teal-500 hover:bg-teal-50/40" onClick={() => navigate("patients", { patientId: e.patientId })}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{e.patientName}</p>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{e.title} · {e.therapist}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={(e.sinceReview / e.threshold) * 100} className="h-1.5" />
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{e.sinceReview}/{e.threshold} to review</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Progress reviews due</p>
              {(data?.reviewsDue || []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">All caught up — no reviews due</div>
              ) : (
                (data?.reviewsDue || []).map((r) => (
                  <button key={r.id} type="button" className="w-full rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-left hover:bg-amber-50" onClick={() => navigate("progress-reviews", { episodeId: r.id })}>
                    <p className="truncate text-sm font-medium">{r.patientName}</p>
                    <p className="text-xs text-muted-foreground">{r.sessionsSinceReview}/{r.threshold} sessions · {r.therapist}</p>
                  </button>
                ))
              )}
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently discharged</p>
              {(data?.recentlyDischarged || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs">
                  <span className="truncate font-medium">{d.patientName}</span>
                  <span className="shrink-0 text-muted-foreground">{d.closedDate ? formatDate(d.closedDate) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Charts */}
        <SectionCard title="Appointments this week" icon="BarChart3" loading={isLoading}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.appointmentsByDay || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                <ReTooltip />
                <Bar dataKey="appointments" fill="#0e9f8a" radius={[4, 4, 0, 0]} name="Appointments" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Revenue (last 7 days)" icon="LineChart" loading={isLoading}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.revenueByDay || []}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `₵${v}`} />
                <ReTooltip formatter={(v) => [`₵${v}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#123c66" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Activity feed */}
        <SectionCard title="Recent activity" icon="History" loading={isLoading}>
          <ScrollArea className="max-h-72 custom-scrollbar">
            <div className="space-y-3">
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
